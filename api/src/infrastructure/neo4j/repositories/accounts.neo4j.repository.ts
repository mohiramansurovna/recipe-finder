import type { Driver, ManagedTransaction } from 'neo4j-driver';

import type {
    AccountsRepository,
    RegisterAccountCommand,
    RegistrationResult,
    ResendResult,
    ResendVerificationCommand,
    VerifyAccountCommand,
} from '../../../core/accounts/accounts.repository.js';
import { withSession } from '../neo4j-sessions.js';
import { assertAccountSchemaReady } from '../account-schema.js';

function asNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (value !== null && typeof value === 'object' && 'toNumber' in value) {
        const number = (value as { toNumber(): number }).toNumber();
        if (Number.isSafeInteger(number)) return number;
    }
    throw new Error('Neo4j returned an invalid account value.');
}

async function reserveQuota(
    transaction: ManagedTransaction,
    key: string,
    limit: number,
    now: number,
): Promise<boolean> {
    const result = await transaction.run(
        `MERGE (bucket:AccountRateLimit {key: $key})
         ON CREATE SET bucket.events = []
         SET bucket.lockVersion = coalesce(bucket.lockVersion, 0) + 1
         WITH bucket, [time IN coalesce(bucket.events, []) WHERE time > $cutoff] AS recent
         WITH bucket, recent, size(recent) < $limit AS available
         SET bucket.events = CASE WHEN available THEN recent + $now ELSE recent END
         RETURN available`,
        { key, cutoff: now - 60 * 60 * 1000, limit, now },
    );
    return result.records[0]?.get('available') === true;
}

function isIdentityConstraintError(error: unknown): boolean {
    return (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        error.code.includes('ConstraintValidationFailed')
    );
}

export class Neo4jAccountsRepository implements AccountsRepository {
    constructor(
        private readonly driver: Driver,
        private readonly database: string,
    ) {}

    async register(command: RegisterAccountCommand): Promise<RegistrationResult> {
        try {
            return await withSession(this.driver, this.database, (session) =>
                session.executeWrite(async (transaction) => {
                    const duplicate = await transaction.run(
                        `MATCH (account:Account)
                         WHERE account.emailNormalized = $email OR account.usernameNormalized = $username
                         RETURN count(account) AS count`,
                        { email: command.email, username: command.username },
                    );
                    if (asNumber(duplicate.records[0]?.get('count')) > 0) return 'duplicate';
                    if (!(await reserveQuota(transaction, `ip:${command.ipRateKey}`, 10, command.now))) {
                        return 'rate-limited';
                    }
                    if (!(await reserveQuota(transaction, `account:${command.accountRateKey}`, 3, command.now))) {
                        return 'rate-limited';
                    }
                    await transaction.run(
                        `CREATE (account:Account {
                           id: $accountId,
                           emailNormalized: $email,
                           usernameNormalized: $username,
                           passwordHash: $passwordHash,
                           emailVerified: false,
                           createdAt: $now,
                           lockVersion: 0
                         })
                         CREATE (challenge:VerificationChallenge {
                           id: $challengeId,
                           purpose: 'email-verification',
                           codeHash: $codeHash,
                           active: true,
                           failedAttempts: 0,
                           createdAt: $now,
                           expiresAt: $expiresAt
                         })
                         CREATE (account)-[:HAS_CHALLENGE]->(challenge)`,
                        {
                            accountId: command.accountId,
                            email: command.email,
                            username: command.username,
                            passwordHash: command.passwordHash,
                            challengeId: command.challengeId,
                            codeHash: command.codeHash,
                            now: command.now,
                            expiresAt: command.codeExpiresAt,
                        },
                    );
                    return 'created';
                }),
            );
        } catch (error) {
            if (isIdentityConstraintError(error)) return 'duplicate';
            throw error;
        }
    }

    async resendVerification(command: ResendVerificationCommand): Promise<ResendResult> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                if (!(await reserveQuota(transaction, `ip:${command.ipRateKey}`, 10, command.now))) {
                    return 'rate-limited';
                }
                const accountResult = await transaction.run(
                    `MATCH (account:Account {emailNormalized: $email})
                     SET account.lockVersion = coalesce(account.lockVersion, 0) + 1
                     RETURN account.id AS id, account.emailVerified AS verified`,
                    { email: command.email },
                );
                const account = accountResult.records[0];
                if (account === undefined || account.get('verified') === true) return 'ineligible';
                const accountId = account.get('id');
                if (typeof accountId !== 'string') throw new Error('Neo4j returned an invalid account ID.');
                if (!(await reserveQuota(transaction, `account:${accountId}`, 3, command.now))) {
                    return 'rate-limited';
                }
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     OPTIONAL MATCH (account)-[:HAS_CHALLENGE]->(previous:VerificationChallenge {
                       purpose: 'email-verification',
                       active: true
                     })
                     SET previous.active = false, previous.invalidatedAt = $now
                     CREATE (challenge:VerificationChallenge {
                       id: $challengeId,
                       purpose: 'email-verification',
                       codeHash: $codeHash,
                       active: true,
                       failedAttempts: 0,
                       createdAt: $now,
                       expiresAt: $expiresAt
                     })
                     CREATE (account)-[:HAS_CHALLENGE]->(challenge)`,
                    {
                        accountId,
                        challengeId: command.challengeId,
                        codeHash: command.codeHash,
                        now: command.now,
                        expiresAt: command.codeExpiresAt,
                    },
                );
                return 'issued';
            }),
        );
    }

    async verify(command: VerifyAccountCommand): Promise<boolean> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                const accountResult = await transaction.run(
                    `MATCH (account:Account {emailNormalized: $email})
                     SET account.lockVersion = coalesce(account.lockVersion, 0) + 1
                     RETURN account.id AS id, account.emailVerified AS verified`,
                    { email: command.email },
                );
                const account = accountResult.records[0];
                if (account === undefined || account.get('verified') === true) return false;
                const accountId = account.get('id');
                if (typeof accountId !== 'string') throw new Error('Neo4j returned an invalid account ID.');
                const challengeResult = await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_CHALLENGE]->
                           (challenge:VerificationChallenge {purpose: 'email-verification', active: true})
                     RETURN challenge.id AS id, challenge.codeHash AS codeHash,
                            challenge.failedAttempts AS failedAttempts, challenge.expiresAt AS expiresAt`,
                    { accountId },
                );
                const challenge = challengeResult.records[0];
                if (challenge === undefined) return false;
                const failedAttempts = asNumber(challenge.get('failedAttempts'));
                const expiresAt = asNumber(challenge.get('expiresAt'));
                if (failedAttempts >= 5 || expiresAt <= command.now) return false;
                const challengeId = challenge.get('id');
                if (typeof challengeId !== 'string') throw new Error('Neo4j returned an invalid challenge ID.');

                if (challenge.get('codeHash') !== command.codeHash) {
                    await transaction.run(
                        `MATCH (challenge:VerificationChallenge {id: $challengeId, active: true})
                         SET challenge.failedAttempts = challenge.failedAttempts + 1`,
                        { challengeId },
                    );
                    return false;
                }
                const consumed = await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_CHALLENGE]->
                           (challenge:VerificationChallenge {id: $challengeId, active: true})
                     WHERE challenge.expiresAt > $now AND challenge.failedAttempts < 5
                     SET challenge.active = false,
                         challenge.consumedAt = $now,
                         account.emailVerified = true,
                         account.emailVerifiedAt = $now
                     RETURN count(account) AS count`,
                    { accountId, challengeId, now: command.now },
                );
                return asNumber(consumed.records[0]?.get('count')) === 1;
            }),
        );
    }

    assertReady(): Promise<void> {
        return assertAccountSchemaReady(this.driver, this.database);
    }
}
