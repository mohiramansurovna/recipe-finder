import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Driver, ManagedTransaction } from 'neo4j-driver';
import { REFRESH_RECIPE_RATING_QUERY } from '../rating-averages.js';

import {
    AccountAlreadyExistsError,
    GoogleAccountCreationConflictError,
    RecipeNotFoundError,
    SessionExpiredError,
} from '../../../core/accounts/accounts.errors.js';
import type {
    AccountProfile,
    AccountSessionClaim,
    AccountsRepository,
    FavoriteRecipe,
    FavoriteRecipeCommand,
    GoogleAccountCommand,
    GoogleAccountRecord,
    IssueSessionCommand,
    PasswordAccountRecord,
    RatingCommand,
    RecoveryChallengeCommand,
    RecoveryResult,
    RegisterAccountCommand,
    RegistrationResult,
    ResendResult,
    ResendVerificationCommand,
    ResetPasswordCommand,
    SessionSummary,
    SessionTokens,
    VerifyAccountCommand,
} from '../../../core/accounts/accounts.repository.js';
import { readMinutes, readStringArray } from '../neo4j-readers.js';
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

function asString(value: unknown, label: string): string {
    if (typeof value === 'string') return value;
    throw new Error(`Neo4j returned an invalid ${label}.`);
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

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

async function lockAuthorizedAccount(
    transaction: ManagedTransaction,
    accountId: string,
    sessionId: string,
    accessTokenHash: string,
    now: number,
): Promise<void> {
    const result = await transaction.run(
        `MATCH (account:Account {id: $accountId})-[:HAS_SESSION]->(session:AccountSession {id: $sessionId})
         WHERE session.active = true
           AND session.expiresAt > $now
           AND session.accessExpiresAt > $now
           AND session.accessTokenHash = $accessTokenHash
         SET account.lockVersion = coalesce(account.lockVersion, 0) + 1,
             session.lockVersion = coalesce(session.lockVersion, 0) + 1
         RETURN account.id AS accountId`,
        { accountId, sessionId, accessTokenHash, now },
    );
    if (result.records.length === 0) throw new SessionExpiredError();
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
                    `MATCH (account:Account {id: $accountId})
                     MATCH (account)-[:HAS_CHALLENGE]->(challenge:VerificationChallenge {
                       purpose: 'email-verification',
                       active: true
                     })
                     WHERE challenge.expiresAt > $now AND challenge.failedAttempts < 5
                     RETURN challenge.id AS id, challenge.codeHash AS codeHash, challenge.failedAttempts AS failedAttempts,
                            challenge.expiresAt AS expiresAt`,
                    { accountId, now: command.now },
                );
                const challenge = challengeResult.records[0];
                if (challenge === undefined) return false;
                const failedAttempts = asNumber(challenge.get('failedAttempts'));
                const expiresAt = asNumber(challenge.get('expiresAt'));
                if (failedAttempts >= 5 || expiresAt <= command.now) return false;
                const codeHash = challenge.get('codeHash');
                if (typeof codeHash !== 'string') throw new Error('Neo4j returned an invalid code hash.');
                if (codeHash !== command.codeHash) {
                    await transaction.run(
                        `MATCH (account:Account {id: $accountId})
                         MATCH (account)-[:HAS_CHALLENGE]->(challenge:VerificationChallenge {
                           purpose: 'email-verification',
                           active: true
                         })
                         WHERE challenge.expiresAt > $now AND challenge.failedAttempts < 5
                         SET challenge.failedAttempts = challenge.failedAttempts + 1
                         RETURN count(account) AS count`,
                        { accountId, now: command.now },
                    );
                    return false;
                }

                await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     MATCH (account)-[:HAS_CHALLENGE]->(challenge:VerificationChallenge {
                       purpose: 'email-verification',
                       active: true
                     })
                     WHERE challenge.expiresAt > $now AND challenge.failedAttempts < 5
                     SET challenge.active = false,
                         account.emailVerified = true,
                         challenge.usedAt = $now
                     RETURN count(account) AS count`,
                    { accountId, now: command.now },
                );
                return true;
            }),
        );
    }

    async assertReady(): Promise<void> {
        await assertAccountSchemaReady(this.driver, this.database);
    }

    async getPasswordAccountForSignIn(email: string): Promise<PasswordAccountRecord | null> {
        return withSession(this.driver, this.database, async (session) => {
            const result = await session.run(
                `MATCH (account:Account {emailNormalized: $email})
                 OPTIONAL MATCH (account)-[:HAS_GOOGLE_IDENTITY]->(identity:GoogleIdentity)
                 RETURN account.id AS accountId,
                        account.passwordHash AS passwordHash,
                        account.emailVerified AS emailVerified,
                        CASE WHEN count(identity) > 0 THEN 'google' ELSE 'password' END AS authMethod`,
                { email },
            );
            const record = result.records[0];
            if (record === undefined) return null;
            return {
                accountId: asString(record.get('accountId'), 'account ID'),
                passwordHash: asString(record.get('passwordHash'), 'password hash'),
                emailVerified: record.get('emailVerified') === true,
                authMethod: record.get('authMethod') === 'google' ? 'google' : 'password',
            };
        });
    }

    async issueSession(command: IssueSessionCommand): Promise<SessionTokens | null> {
        const sessionId = randomUUID();
        const accessTokenHash = hashToken(command.accessToken);
        const refreshTokenHash = hashToken(command.refreshToken);
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                const lockedAccount = await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     SET account.lockVersion = coalesce(account.lockVersion, 0) + 1
                     RETURN account.id AS accountId`,
                    { accountId: command.accountId },
                );
                if (lockedAccount.records[0] === undefined) return null;

                if (command.expectedPasswordHash !== undefined) {
                    const credential = await transaction.run(
                        `MATCH (account:Account {id: $accountId})
                         RETURN account.passwordHash AS passwordHash`,
                        { accountId: command.accountId },
                    );
                    if (credential.records[0]?.get('passwordHash') !== command.expectedPasswordHash) return null;
                }

                const result = await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                 CREATE (session:AccountSession {
                   id: $sessionId,
                   active: true,
                   accessTokenHash: $accessTokenHash,
                   accessExpiresAt: $now + 15 * 60 * 1000,
                   refreshTokenHash: $refreshTokenHash,
                   rotatedRefreshTokenHashes: [],
                   lockVersion: 0,
                   deviceName: $deviceName,
                   createdAt: $now,
                   lastUsedAt: $now,
                   expiresAt: $now + 30 * 24 * 60 * 60 * 1000
                 })
                 CREATE (account)-[:HAS_SESSION]->(session)
                 RETURN session.id AS sessionId`,
                {
                    accountId: command.accountId,
                    sessionId,
                    accessTokenHash,
                    refreshTokenHash,
                    deviceName: command.deviceName,
                    now: command.now,
                },
            );
            const record = result.records[0];
                if (record === undefined) throw new Error('Neo4j did not create a session.');
                return {
                    sessionId: asString(record.get('sessionId'), 'session ID'),
                    accessToken: command.accessToken,
                    refreshToken: command.refreshToken,
                };
            }),
        );
    }

    async validateAccessToken(accessToken: string, now: number): Promise<AccountSessionClaim | null> {
        const accessTokenHash = hashToken(accessToken);
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                const result = await transaction.run(
                `MATCH (account:Account)-[:HAS_SESSION]->(session:AccountSession)
                 WHERE session.active = true
                   AND session.accessTokenHash = $accessTokenHash
                   AND session.accessExpiresAt > $now
                   AND session.expiresAt > $now
                 SET session.lockVersion = coalesce(session.lockVersion, 0) + 1,
                     session.lastUsedAt = $now
                 RETURN account.id AS accountId, session.id AS sessionId,
                        session.accessTokenHash AS accessTokenHash`,
                { accessTokenHash, now },
            );
            const record = result.records[0];
            if (record === undefined) return null;
            return {
                accountId: asString(record.get('accountId'), 'account ID'),
                sessionId: asString(record.get('sessionId'), 'session ID'),
                accessTokenHash: asString(record.get('accessTokenHash'), 'access token hash'),
            };
            }),
        );
    }

    async getProfile(
        accountId: string,
        sessionId: string,
        accessTokenHash: string,
        now: number,
    ): Promise<AccountProfile | null> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(transaction, accountId, sessionId, accessTokenHash, now);
                const result = await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     RETURN account.emailNormalized AS email, account.usernameNormalized AS username`,
                    { accountId },
                );
                const record = result.records[0];
                if (record === undefined) return null;
                return {
                    email: asString(record.get('email'), 'email'),
                    username: asString(record.get('username'), 'username'),
                };
            }),
        );
    }

    async listSessions(
        accountId: string,
        currentSessionId: string,
        accessTokenHash: string,
        now: number,
    ): Promise<SessionSummary[]> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(transaction, accountId, currentSessionId, accessTokenHash, now);
                const result = await transaction.run(
                `MATCH (account:Account {id: $accountId})-[:HAS_SESSION]->(session:AccountSession)
                 WHERE session.active = true AND session.expiresAt > $now
                 RETURN session.id AS sessionId,
                        session.deviceName AS deviceName,
                        session.createdAt AS createdAt,
                        session.lastUsedAt AS lastUsedAt,
                        session.expiresAt AS expiresAt
                 ORDER BY session.lastUsedAt DESC`,
                { accountId, now },
            );
            return result.records.map((record) => ({
                sessionId: asString(record.get('sessionId'), 'session ID'),
                deviceName: asString(record.get('deviceName'), 'device name'),
                createdAt: asNumber(record.get('createdAt')),
                lastUsedAt: asNumber(record.get('lastUsedAt')),
                expiresAt: asNumber(record.get('expiresAt')),
                current: false,
            }));
            }),
        );
    }

    async refreshSession(refreshToken: string, now: number): Promise<SessionTokens | null> {
        const refreshTokenHash = hashToken(refreshToken);
        const nextAccessToken = randomBytes(32).toString('base64url');
        const nextRefreshToken = randomBytes(32).toString('base64url');
        const nextAccessHash = hashToken(nextAccessToken);
        const nextRefreshHash = hashToken(nextRefreshToken);
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                const candidate = await transaction.run(
                    `MATCH (:Account)-[:HAS_SESSION]->(session:AccountSession)
                     WHERE session.active = true
                       AND session.expiresAt > $now
                       AND (session.refreshTokenHash = $refreshTokenHash
                            OR $refreshTokenHash IN coalesce(session.rotatedRefreshTokenHashes, []))
                     SET session.lockVersion = coalesce(session.lockVersion, 0) + 1
                     RETURN session.id AS sessionId`,
                    { refreshTokenHash, now },
                );
                const candidateRecord = candidate.records[0];
                if (candidateRecord === undefined) return null;
                const sessionId = asString(candidateRecord.get('sessionId'), 'session ID');
                const state = await transaction.run(
                    `MATCH (session:AccountSession {id: $sessionId})
                     WHERE session.active = true AND session.expiresAt > $now
                     RETURN session.refreshTokenHash AS currentTokenHash,
                            $refreshTokenHash IN coalesce(session.rotatedRefreshTokenHashes, []) AS replay`,
                    { sessionId, refreshTokenHash, now },
                );
                const stateRecord = state.records[0];
                if (stateRecord === undefined) return null;
                if (stateRecord.get('replay') === true) {
                    await transaction.run(
                        `MATCH (session:AccountSession {id: $sessionId})
                         WHERE session.active = true
                         SET session.lockVersion = coalesce(session.lockVersion, 0) + 1,
                             session.active = false,
                             session.revokedAt = $now`,
                        { sessionId, now },
                    );
                    return null;
                }
                if (stateRecord.get('currentTokenHash') !== refreshTokenHash) return null;

                const result = await transaction.run(
                    `MATCH (:Account)-[:HAS_SESSION]->(session:AccountSession)
                     WHERE session.active = true
                       AND session.id = $sessionId
                       AND session.refreshTokenHash = $refreshTokenHash
                       AND session.expiresAt > $now
                     SET session.lockVersion = coalesce(session.lockVersion, 0) + 1,
                         session.rotatedRefreshTokenHashes =
                           coalesce(session.rotatedRefreshTokenHashes, []) + session.refreshTokenHash,
                         session.accessTokenHash = $nextAccessHash,
                         session.accessExpiresAt = $now + 15 * 60 * 1000,
                         session.refreshTokenHash = $nextRefreshHash,
                         session.lastUsedAt = $now,
                         session.expiresAt = $now + 30 * 24 * 60 * 60 * 1000
                     RETURN session.id AS sessionId`,
                    {
                        sessionId,
                        refreshTokenHash,
                        nextAccessHash,
                        nextRefreshHash,
                        now,
                    },
                );
                const record = result.records[0];
                if (record === undefined) return null;
                return {
                    sessionId: asString(record.get('sessionId'), 'session ID'),
                    accessToken: nextAccessToken,
                    refreshToken: nextRefreshToken,
                };
            }),
        );
    }

    async revokeSession(
        accountId: string,
        currentSessionId: string,
        accessTokenHash: string,
        sessionId: string,
        now: number,
    ): Promise<void> {
        await withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(transaction, accountId, currentSessionId, accessTokenHash, now);
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_SESSION]->(session:AccountSession {id: $sessionId})
                     SET session.lockVersion = coalesce(session.lockVersion, 0) + 1,
                         session.active = false, session.revokedAt = $now`,
                    { accountId, sessionId, now },
                );
            }),
        );
    }

    async requestRecovery(command: RecoveryChallengeCommand): Promise<RecoveryResult> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                if (!(await reserveQuota(transaction, `ip:${command.ipRateKey}`, 10, command.now))) {
                    return 'rate-limited';
                }
                const accountResult = await transaction.run(
                    `MATCH (account:Account {emailNormalized: $email})
                     WHERE NOT EXISTS {
                       MATCH (account)-[:HAS_GOOGLE_IDENTITY]->(:GoogleIdentity)
                     }
                     SET account.lockVersion = coalesce(account.lockVersion, 0) + 1
                     RETURN account.id AS accountId`,
                    { email: command.email },
                );
                const account = accountResult.records[0];
                if (account === undefined) return 'not-found';
                const accountId = account.get('accountId');
                if (typeof accountId !== 'string') throw new Error('Neo4j returned an invalid account ID.');
                if (!(await reserveQuota(transaction, `recovery:${accountId}`, 3, command.now))) {
                    return 'rate-limited';
                }
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     OPTIONAL MATCH (account)-[:HAS_CHALLENGE]->(previous:RecoveryChallenge {purpose: 'password-reset', active: true})
                     SET previous.active = false, previous.invalidatedAt = $now
                     CREATE (challenge:RecoveryChallenge {
                       id: $challengeId,
                       purpose: 'password-reset',
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
                        expiresAt: command.codeExpiresAt,
                        now: command.now,
                    },
                );
                return 'issued';
            }),
        );
    }

    async resetPassword(command: ResetPasswordCommand): Promise<boolean> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                const accountResult = await transaction.run(
                    `MATCH (account:Account {emailNormalized: $email})
                     WHERE NOT EXISTS {
                       MATCH (account)-[:HAS_GOOGLE_IDENTITY]->(:GoogleIdentity)
                     }
                     SET account.lockVersion = coalesce(account.lockVersion, 0) + 1
                     RETURN account.id AS accountId`,
                    { email: command.email },
                );
                const account = accountResult.records[0];
                if (account === undefined) return false;
                const accountId = account.get('accountId');
                if (typeof accountId !== 'string') throw new Error('Neo4j returned an invalid account ID.');
                const challengeResult = await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_CHALLENGE]->(challenge:RecoveryChallenge)
                     WHERE challenge.purpose = 'password-reset'
                       AND challenge.active = true
                     RETURN challenge.id AS challengeId,
                            challenge.codeHash AS codeHash,
                            challenge.expiresAt AS expiresAt,
                            challenge.failedAttempts AS failedAttempts`,
                    { accountId },
                );
                const challenge = challengeResult.records[0];
                if (challenge === undefined) return false;
                const expiresAt = asNumber(challenge.get('expiresAt'));
                const failedAttempts = asNumber(challenge.get('failedAttempts'));
                if (expiresAt <= command.now || failedAttempts >= 5) return false;
                const codeHash = asString(challenge.get('codeHash'), 'recovery code hash');
                const challengeId = asString(challenge.get('challengeId'), 'recovery challenge ID');
                if (codeHash !== command.codeHash) {
                    await transaction.run(
                        `MATCH (account:Account {id: $accountId})-[:HAS_CHALLENGE]->(challenge:RecoveryChallenge {id: $challengeId})
                         WHERE challenge.active = true
                           AND challenge.expiresAt > $now
                           AND challenge.failedAttempts < 5
                         SET challenge.failedAttempts = challenge.failedAttempts + 1`,
                        { accountId, challengeId, now: command.now },
                    );
                    return false;
                }
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     MATCH (account)-[:HAS_CHALLENGE]->(challenge:RecoveryChallenge {id: $challengeId})
                     WHERE challenge.active = true
                       AND challenge.expiresAt > $now
                       AND challenge.failedAttempts < 5
                     SET account.passwordHash = $newPasswordHash,
                         challenge.active = false,
                         challenge.usedAt = $now`,
                    {
                        accountId,
                        challengeId,
                        newPasswordHash: command.newPasswordHash,
                        now: command.now,
                    },
                );
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_SESSION]->(session:AccountSession)
                     SET session.lockVersion = coalesce(session.lockVersion, 0) + 1,
                         session.active = false,
                         session.revokedAt = $now`,
                    { accountId, now: command.now },
                );
                return true;
            }),
        );
    }

    async getGoogleAccount(subject: string): Promise<GoogleAccountRecord | null> {
        return withSession(this.driver, this.database, async (session) => {
            const result = await session.run(
                `MATCH (account:Account)-[:HAS_GOOGLE_IDENTITY]->(identity:GoogleIdentity)
                 WHERE identity.subject = $subject
                 RETURN account.id AS accountId, account.emailNormalized AS email, account.usernameNormalized AS username, account.emailVerified AS emailVerified`,
                { subject },
            );
            const record = result.records[0];
            if (record === undefined) return null;
            return {
                accountId: asString(record.get('accountId'), 'account ID'),
                email: asString(record.get('email'), 'email'),
                username: asString(record.get('username'), 'username'),
                emailVerified: record.get('emailVerified') === true,
            };
        });
    }

    async createGoogleAccount(command: GoogleAccountCommand): Promise<GoogleAccountRecord> {
        const needsVerification = !command.emailVerified;
        if (
            needsVerification &&
            (command.challengeId === undefined || command.codeHash === undefined || command.codeExpiresAt === undefined)
        ) {
            throw new Error('An unverified Google account requires a verification challenge.');
        }
        try {
            return await withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                const result = await transaction.run(
                    `CREATE (account:Account {
                       id: $accountId,
                       emailNormalized: $email,
                       usernameNormalized: $username,
                       emailVerified: $emailVerified,
                       createdAt: $now,
                       passwordHash: '',
                       lockVersion: 0
                     })
                     CREATE (identity:GoogleIdentity {subject: $subject, emailVerified: $emailVerified})
                     CREATE (account)-[:HAS_GOOGLE_IDENTITY]->(identity)
                     RETURN account.id AS accountId,
                            account.emailNormalized AS email,
                            account.usernameNormalized AS username,
                            account.emailVerified AS emailVerified`,
                    {
                        accountId: command.accountId,
                        username: command.username,
                        email: command.email,
                        subject: command.subject,
                        emailVerified: command.emailVerified,
                        now: command.now,
                    },
                );
                const record = result.records[0];
                if (record === undefined) throw new Error('Neo4j did not create the Google account.');
                if (needsVerification) {
                    await transaction.run(
                        `MATCH (account:Account {id: $accountId})
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
                            challengeId: command.challengeId,
                            codeHash: command.codeHash,
                            now: command.now,
                            expiresAt: command.codeExpiresAt,
                        },
                    );
                }
                return {
                    accountId: asString(record.get('accountId'), 'account ID'),
                    email: asString(record.get('email'), 'email'),
                    username: asString(record.get('username'), 'username'),
                    emailVerified: record.get('emailVerified') === true,
                };
                }),
            );
        } catch (error) {
            if (!isIdentityConstraintError(error)) throw error;
            const existing = await this.getGoogleAccount(command.subject);
            if (existing !== null) throw new GoogleAccountCreationConflictError();
            throw new AccountAlreadyExistsError();
        }
    }

    async addFavorite(command: FavoriteRecipeCommand): Promise<boolean> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(
                    transaction,
                    command.accountId,
                    command.sessionId,
                    command.accessTokenHash,
                    command.now,
                );
                const owner = await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     MATCH (recipe:Recipe {id: $recipeId})
                     RETURN account.id AS accountId`,
                    { accountId: command.accountId, recipeId: command.recipeId },
                );
                if (owner.records.length === 0) {
                     const recipe = await transaction.run(
                         `MATCH (recipe:Recipe {id: $recipeId}) RETURN recipe.id AS recipeId`,
                         { recipeId: command.recipeId },
                     );
                     if (recipe.records.length === 0) throw new RecipeNotFoundError();
                     return false;
                }
                const result = await transaction.run(
                     `MATCH (account:Account {id: $accountId})
                      MATCH (recipe:Recipe {id: $recipeId})
                      OPTIONAL MATCH (account)-[existing:HAS_FAVORITE]->(recipe)
                      WITH account, recipe, count(existing) > 0 AS alreadyFavorite
                      MERGE (account)-[:HAS_FAVORITE]->(recipe)
                      RETURN alreadyFavorite`,
                     { accountId: command.accountId, recipeId: command.recipeId },
                );
                return result.records[0]?.get('alreadyFavorite') !== true;
            }),
        );
    }

    async removeFavorite(command: FavoriteRecipeCommand): Promise<boolean> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(
                    transaction,
                    command.accountId,
                    command.sessionId,
                    command.accessTokenHash,
                    command.now,
                );
                const recipe = await transaction.run(
                    `MATCH (recipe:Recipe {id: $recipeId}) RETURN recipe.id AS recipeId`,
                    { recipeId: command.recipeId },
                );
                if (recipe.records.length === 0) throw new RecipeNotFoundError();
                const owner = await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     RETURN account.id AS accountId`,
                    { accountId: command.accountId },
                );
                if (owner.records.length === 0) return false;
                const result = await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[rel:HAS_FAVORITE]->(:Recipe {id: $recipeId})
                     DELETE rel
                     RETURN count(rel) AS count`,
                    { accountId: command.accountId, recipeId: command.recipeId },
                );
                return asNumber(result.records[0]?.get('count')) > 0;
            }),
        );
    }

    async listFavorites(
        accountId: string,
        sessionId: string,
        accessTokenHash: string,
        now: number,
    ): Promise<FavoriteRecipe[]> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(transaction, accountId, sessionId, accessTokenHash, now);
                const result = await transaction.run(
                `MATCH (account:Account {id: $accountId})-[:HAS_FAVORITE]->(recipe:Recipe)
                 OPTIONAL MATCH (recipe)-[:USES]->(ingredient:Ingredient)
                 RETURN recipe.id AS id,
                        recipe.name AS name,
                        recipe.minutes AS minutes,
                        collect(DISTINCT ingredient.name) AS ingredientNames
                 ORDER BY id`,
                { accountId },
            );
            return result.records.map((record) => ({
                id: asString(record.get('id'), 'recipe ID'),
                name: asString(record.get('name'), 'recipe name'),
                minutes: readMinutes(record.get('minutes')),
                ingredientNames: readStringArray(record.get('ingredientNames')),
            }));
            }),
        );
    }

    async setRating(command: RatingCommand): Promise<void> {
        await withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(
                    transaction,
                    command.accountId,
                    command.sessionId,
                    command.accessTokenHash,
                    command.now,
                );
                const owner = await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     MATCH (recipe:Recipe {id: $recipeId})
                     RETURN account.id AS accountId`,
                    { accountId: command.accountId, recipeId: command.recipeId },
                );
                if (owner.records.length === 0) {
                    const recipe = await transaction.run(
                        `MATCH (recipe:Recipe {id: $recipeId}) RETURN recipe.id AS recipeId`,
                        { recipeId: command.recipeId },
                    );
                    if (recipe.records.length === 0) throw new RecipeNotFoundError();
                    return;
                }
                const updated = await transaction.run(
                    `MATCH (:Account {id: $accountId})-[:HAS_RATING]->(rating:Rating)<-[:HAS_RATING]-(:Recipe {id: $recipeId})
                     SET rating.value = $value
                     RETURN count(rating) AS updated`,
                    { accountId: command.accountId, recipeId: command.recipeId, value: command.value },
                );
                const updatedRecord = updated.records[0];
                if (updatedRecord !== undefined && asNumber(updatedRecord.get('updated')) > 0) {
                    await transaction.run(REFRESH_RECIPE_RATING_QUERY, { recipeId: command.recipeId });
                    return;
                }
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     MATCH (recipe:Recipe {id: $recipeId})
                     CREATE (rating:Rating {value: $value})
                     CREATE (account)-[:HAS_RATING]->(rating)
                     CREATE (recipe)-[:HAS_RATING]->(rating)`,
                    { accountId: command.accountId, recipeId: command.recipeId, value: command.value },
                );
                await transaction.run(REFRESH_RECIPE_RATING_QUERY, { recipeId: command.recipeId });
            }),
        );
    }

    async removeRating(command: RatingCommand): Promise<void> {
        await withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(
                    transaction,
                    command.accountId,
                    command.sessionId,
                    command.accessTokenHash,
                    command.now,
                );
                const recipe = await transaction.run(
                    `MATCH (recipe:Recipe {id: $recipeId}) RETURN recipe.id AS recipeId`,
                    { recipeId: command.recipeId },
                );
                if (recipe.records.length === 0) throw new RecipeNotFoundError();
                await transaction.run(
                    `MATCH (:Account {id: $accountId})-[:HAS_RATING]->(rating:Rating)<-[:HAS_RATING]-(:Recipe {id: $recipeId})
                     DETACH DELETE rating`,
                    { accountId: command.accountId, recipeId: command.recipeId },
                );
                await transaction.run(REFRESH_RECIPE_RATING_QUERY, { recipeId: command.recipeId });
            }),
        );
    }

    async getRating(command: RatingCommand): Promise<number | null> {
        return withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(
                    transaction,
                    command.accountId,
                    command.sessionId,
                    command.accessTokenHash,
                    command.now,
                );
                const result = await transaction.run(
                `MATCH (recipe:Recipe {id: $recipeId})
                 OPTIONAL MATCH (:Account {id: $accountId})-[:HAS_RATING]->(rating:Rating)<-[:HAS_RATING]-(recipe)
                 RETURN rating.value AS ratingValue`,
                { accountId: command.accountId, recipeId: command.recipeId },
            );
            const record = result.records[0];
            if (record === undefined) throw new RecipeNotFoundError();
            if (record.get('ratingValue') === null) return null;
            return asNumber(record.get('ratingValue'));
            }),
        );
    }

    async deleteAccount(
        accountId: string,
        sessionId: string,
        accessTokenHash: string,
        now: number,
    ): Promise<void> {
        await withSession(this.driver, this.database, (session) =>
            session.executeWrite(async (transaction) => {
                await lockAuthorizedAccount(transaction, accountId, sessionId, accessTokenHash, now);
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[favorite:HAS_FAVORITE]->(:Recipe)
                     DELETE favorite`,
                    { accountId },
                );
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[ownRating:HAS_RATING]->(:Rating)
                     DELETE ownRating`,
                    { accountId },
                );
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_GOOGLE_IDENTITY]->(identity:GoogleIdentity)
                     DETACH DELETE identity`,
                    { accountId },
                );
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_CHALLENGE]->(challenge)
                     DETACH DELETE challenge`,
                    { accountId },
                );
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})-[:HAS_SESSION]->(session:AccountSession)
                     DELETE session`,
                    { accountId },
                );
                await transaction.run(
                    `MATCH (quota:AccountRateLimit)
                     WHERE quota.key IN [$accountKey, $recoveryKey]
                     DETACH DELETE quota`,
                    {
                        accountKey: `account:${accountId}`,
                        recoveryKey: `recovery:${accountId}`,
                    },
                );
                await transaction.run(
                    `MATCH (account:Account {id: $accountId})
                     DETACH DELETE account`,
                    { accountId },
                );
            }),
        );
    }
}
