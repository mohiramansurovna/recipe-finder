import type { Driver, ManagedTransaction } from 'neo4j-driver';
import { describe, expect, it, vi } from 'vitest';

import type {
    RegisterAccountCommand,
    ResendVerificationCommand,
    VerifyAccountCommand,
} from '../api/src/core/accounts/accounts.repository.js';
import { Neo4jAccountsRepository } from '../api/src/infrastructure/neo4j/repositories/accounts.neo4j.repository.js';

type QueryRecord = { get(key: string): unknown };

function record(values: Record<string, unknown>): QueryRecord {
    return { get: (key) => values[key] };
}

function repositoryWith(
    respond: (query: string, values?: Record<string, unknown>) => QueryRecord[],
) {
    const queries: { query: string; values?: Record<string, unknown> }[] = [];
    const transaction = {
        run: vi.fn(async (query: string, values?: Record<string, unknown>) => {
            queries.push({ query, values });
            return { records: respond(query, values) };
        }),
    };
    const session = {
        executeWrite: vi.fn(async <T>(work: (tx: ManagedTransaction) => Promise<T>) =>
            work(transaction as unknown as ManagedTransaction),
        ),
        close: vi.fn(async () => undefined),
    };
    const repository = new Neo4jAccountsRepository(
        { session: () => session } as unknown as Driver,
        'neo4j',
    );
    return { repository, queries, session };
}

function command(): RegisterAccountCommand {
    return {
        accountId: 'account-id',
        challengeId: 'challenge-id',
        email: 'cook@example.test',
        username: 'home_cook',
        passwordHash: 'argon2id-password-hash',
        codeHash: 'hmac-verification-hash',
        codeExpiresAt: 1_800_000_000_000 + 24 * 60 * 60 * 1000,
        now: 1_800_000_000_000,
        accountRateKey: 'account-id',
        ipRateKey: 'ip-hash',
    };
}

describe('Neo4j account repository concurrency handling', () => {
    it('maps a uniqueness race to a safe duplicate result and rolls back the transaction', async () => {
        const queries: string[] = [];
        const transaction = {
            run: vi.fn(async (query: string) => {
                queries.push(query);
                if (query.startsWith('MATCH (account:Account)')) {
                    return { records: [{ get: () => 0 }] };
                }
                if (query.includes('RETURN available')) {
                    return { records: [{ get: () => true }] };
                }
                if (query.startsWith('CREATE (account:Account')) {
                    throw Object.assign(new Error('unique identity conflict'), {
                        code: 'Neo.ClientError.Schema.ConstraintValidationFailed',
                    });
                }
                return { records: [] };
            }),
        };
        const session = {
            executeWrite: async <T>(work: (tx: ManagedTransaction) => Promise<T>) =>
                work(transaction as unknown as ManagedTransaction),
            close: vi.fn(async () => undefined),
        };
        const driver = { session: () => session } as unknown as Driver;
        const repository = new Neo4jAccountsRepository(driver, 'neo4j');

        await expect(repository.register(command())).resolves.toBe('duplicate');
        expect(queries).toHaveLength(4);
        expect(session.close).toHaveBeenCalledOnce();
    });

    it('only writes credential hashes and normalized identity properties', async () => {
        const params: Record<string, unknown>[] = [];
        const queries: string[] = [];
        const transaction = {
            run: vi.fn(async (query: string, values?: Record<string, unknown>) => {
                queries.push(query);
                if (values !== undefined) params.push(values);
                if (query.startsWith('MATCH (account:Account)')) {
                    return { records: [{ get: () => 0 }] };
                }
                if (query.includes('RETURN available')) {
                    return { records: [{ get: () => true }] };
                }
                return { records: [] };
            }),
        };
        const session = {
            executeWrite: async <T>(work: (tx: ManagedTransaction) => Promise<T>) =>
                work(transaction as unknown as ManagedTransaction),
            close: vi.fn(async () => undefined),
        };
        const repository = new Neo4jAccountsRepository(
            { session: () => session } as unknown as Driver,
            'neo4j',
        );

        await expect(repository.register(command())).resolves.toBe('created');
        const created = params.at(-1);
        expect(created).toMatchObject({
            email: 'cook@example.test',
            username: 'home_cook',
            passwordHash: 'argon2id-password-hash',
            codeHash: 'hmac-verification-hash',
        });
        expect(created).not.toHaveProperty('password');
        expect(created).not.toHaveProperty('code');
        const accountAndChallengeCreate = queries.find((query) => query.startsWith('CREATE (account:Account'));
        expect(accountAndChallengeCreate).toContain('CREATE (challenge:VerificationChallenge');
        expect(accountAndChallengeCreate).toContain('CREATE (account)-[:HAS_CHALLENGE]->(challenge)');
    });

    it('serializes verification and conditionally consumes the current challenge', async () => {
        const now = 1_800_000_000_000;
        const { repository, queries, session } = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS id, account.emailVerified AS verified')) {
                return [record({ id: 'account-id', verified: false })];
            }
            if (query.includes('RETURN challenge.id AS id, challenge.codeHash AS codeHash')) {
                return [record({
                    id: 'challenge-id',
                    codeHash: 'expected-code-hash',
                    failedAttempts: 0,
                    expiresAt: now + 60_000,
                })];
            }
            if (query.includes('RETURN count(account) AS count')) return [record({ count: 1 })];
            return [];
        });

        await expect(repository.verify({
            email: 'cook@example.test',
            codeHash: 'expected-code-hash',
            now,
        } satisfies VerifyAccountCommand)).resolves.toBe(true);

        expect(session.executeWrite).toHaveBeenCalledOnce();
        expect(queries[0]?.query).toContain('SET account.lockVersion = coalesce(account.lockVersion, 0) + 1');
        expect(queries.at(-1)?.query).toContain(
            'WHERE challenge.expiresAt > $now AND challenge.failedAttempts < 5',
        );
        expect(queries.at(-1)?.query).toContain('SET challenge.active = false');
    });

    it('increments a wrong-code attempt and refuses expired or exhausted challenges', async () => {
        const now = 1_800_000_000_000;
        const wrong = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS id, account.emailVerified AS verified')) {
                return [record({ id: 'account-id', verified: false })];
            }
            if (query.includes('RETURN challenge.id AS id, challenge.codeHash AS codeHash')) {
                return [record({
                    id: 'challenge-id',
                    codeHash: 'expected-code-hash',
                    failedAttempts: 4,
                    expiresAt: now + 60_000,
                })];
            }
            return [];
        });

        await expect(wrong.repository.verify({
            email: 'cook@example.test',
            codeHash: 'wrong-code-hash',
            now,
        })).resolves.toBe(false);
        expect(wrong.queries.at(-1)?.query).toContain(
            'SET challenge.failedAttempts = challenge.failedAttempts + 1',
        );
        expect(wrong.queries.some(({ query }) => query.includes('SET challenge.active = false'))).toBe(false);

        for (const challenge of [
            { failedAttempts: 5, expiresAt: now + 60_000 },
            { failedAttempts: 0, expiresAt: now },
        ]) {
            const attempt = repositoryWith((query) => {
                if (query.includes('RETURN account.id AS id, account.emailVerified AS verified')) {
                    return [record({ id: 'account-id', verified: false })];
                }
                if (query.includes('RETURN challenge.id AS id, challenge.codeHash AS codeHash')) {
                    return [record({ id: 'challenge-id', codeHash: 'expected-code-hash', ...challenge })];
                }
                return [];
            });
            await expect(attempt.repository.verify({
                email: 'cook@example.test',
                codeHash: 'expected-code-hash',
                now,
            })).resolves.toBe(false);
            expect(attempt.queries.some(({ query }) => query.includes('SET challenge.failedAttempts'))).toBe(false);
            expect(attempt.queries.some(({ query }) => query.includes('SET challenge.active = false'))).toBe(false);
        }
    });

    it('does not accept a consumed code twice', async () => {
        let accountVerified = false;
        let challengeActive = true;
        const now = 1_800_000_000_000;
        const { repository, session } = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS id, account.emailVerified AS verified')) {
                return [record({ id: 'account-id', verified: accountVerified })];
            }
            if (query.includes('RETURN challenge.id AS id, challenge.codeHash AS codeHash')) {
                return challengeActive
                    ? [record({
                        id: 'challenge-id',
                        codeHash: 'expected-code-hash',
                        failedAttempts: 0,
                        expiresAt: now + 60_000,
                    })]
                    : [];
            }
            if (query.includes('RETURN count(account) AS count')) {
                accountVerified = true;
                challengeActive = false;
                return [record({ count: 1 })];
            }
            return [];
        });
        const verification: VerifyAccountCommand = {
            email: 'cook@example.test',
            codeHash: 'expected-code-hash',
            now,
        };

        await expect(repository.verify(verification)).resolves.toBe(true);
        await expect(repository.verify(verification)).resolves.toBe(false);
        expect(session.executeWrite).toHaveBeenCalledTimes(2);
    });

    it('invalidates and replaces the challenge in one transaction on resend', async () => {
        const command: ResendVerificationCommand = {
            challengeId: 'replacement-id',
            email: 'cook@example.test',
            codeHash: 'replacement-hash',
            codeExpiresAt: 1_800_000_000_000 + 24 * 60 * 60 * 1000,
            now: 1_800_000_000_000,
            ipRateKey: 'ip-hash',
        };
        const { repository, queries, session } = repositoryWith((query) => {
            if (query.includes('RETURN available')) return [record({ available: true })];
            if (query.includes('RETURN account.id AS id, account.emailVerified AS verified')) {
                return [record({ id: 'account-id', verified: false })];
            }
            return [];
        });

        await expect(repository.resendVerification(command)).resolves.toBe('issued');

        expect(session.executeWrite).toHaveBeenCalledOnce();
        const replacement = queries.at(-1);
        expect(replacement?.query).toContain('SET previous.active = false, previous.invalidatedAt = $now');
        expect(replacement?.query).toContain('CREATE (challenge:VerificationChallenge');
        expect(replacement?.values).toMatchObject({
            accountId: 'account-id',
            challengeId: 'replacement-id',
            codeHash: 'replacement-hash',
        });
    });

    it('uses the same rolling-hour account quota for registration and resends', async () => {
        const now = 1_800_000_000_000;
        const registration = repositoryWith((query) => {
            if (query.includes('RETURN count(account) AS count')) return [record({ count: 0 })];
            if (query.includes('RETURN available')) return [record({ available: true })];
            return [];
        });
        await expect(registration.repository.register({ ...command(), now })).resolves.toBe('created');

        const registrationQuotas = registration.queries
            .filter(({ query }) => query.includes('RETURN available'))
            .map(({ values }) => values);
        expect(registrationQuotas).toEqual([
            { key: 'ip:ip-hash', cutoff: now - 60 * 60 * 1000, limit: 10, now },
            { key: 'account:account-id', cutoff: now - 60 * 60 * 1000, limit: 3, now },
        ]);

        const resend = repositoryWith((query) => {
            if (query.includes('RETURN available')) return [record({ available: true })];
            if (query.includes('RETURN account.id AS id, account.emailVerified AS verified')) {
                return [record({ id: 'account-id', verified: false })];
            }
            return [];
        });
        await expect(resend.repository.resendVerification({
            challengeId: 'replacement-id',
            email: 'cook@example.test',
            codeHash: 'replacement-hash',
            codeExpiresAt: now + 24 * 60 * 60 * 1000,
            now,
            ipRateKey: 'ip-hash',
        })).resolves.toBe('issued');

        const resendQuotas = resend.queries
            .filter(({ query }) => query.includes('RETURN available'))
            .map(({ values }) => values);
        expect(resendQuotas).toEqual([
            { key: 'ip:ip-hash', cutoff: now - 60 * 60 * 1000, limit: 10, now },
            { key: 'account:account-id', cutoff: now - 60 * 60 * 1000, limit: 3, now },
        ]);
        for (const { query } of [...registration.queries, ...resend.queries]) {
            if (!query.includes('RETURN available')) continue;
            expect(query).toContain('WHERE time > $cutoff');
            expect(query).toContain('size(recent) < $limit');
        }
    });
});
