import type { Driver, ManagedTransaction } from 'neo4j-driver';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type {
    RegisterAccountCommand,
    ResetPasswordCommand,
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

    it('authenticates the profile read in the same transaction and returns only profile fields', async () => {
        const { repository, queries, session } = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS accountId') && query.includes('session.active = true')) {
                return [record({ accountId: 'account-id' })];
            }
            if (query.includes('RETURN account.emailNormalized AS email')) {
                return [record({ email: 'cook@example.test', username: 'home_cook' })];
            }
            return [];
        });

        await expect(repository.getProfile('account-id', 'session-id', 'access-hash', 1_800_000_000_000))
            .resolves.toEqual({ email: 'cook@example.test', username: 'home_cook' });

        expect(session.executeWrite).toHaveBeenCalledOnce();
        expect(queries[0]?.query).toContain('(session:AccountSession {id: $sessionId})');
        expect(queries[0]?.query).toContain('session.active = true');
        expect(queries[0]?.query).toContain('session.expiresAt > $now');
        expect(queries[0]?.query).toContain('session.accessExpiresAt > $now');
        expect(queries[0]?.query).toContain('session.accessTokenHash = $accessTokenHash');
        expect(queries[0]?.values).toMatchObject({ accountId: 'account-id', sessionId: 'session-id' });
        expect(queries[1]?.query).not.toMatch(/passwordHash|tokenHash|credentials/iu);
    });

    it('locks the account and checks the expected password hash before issuing a session', async () => {
        const now = 1_800_000_000_000;
        let currentPasswordHash = 'new-password-hash';
        const { repository, queries, session } = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS accountId')) {
                return [record({ accountId: 'account-id' })];
            }
            if (query.includes('RETURN account.passwordHash AS passwordHash')) {
                return [record({ passwordHash: currentPasswordHash })];
            }
            if (query.includes('RETURN session.id AS sessionId')) {
                return [record({ sessionId: 'session-id' })];
            }
            return [];
        });
        const command = {
            accountId: 'account-id',
            deviceName: 'Pixel',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            now,
            expectedPasswordHash: 'old-password-hash',
        };

        await expect(repository.issueSession(command)).resolves.toBeNull();
        expect(queries).toHaveLength(2);
        expect(queries[0]?.query).toContain('SET account.lockVersion = coalesce(account.lockVersion, 0) + 1');
        expect(queries[1]?.query).toContain('RETURN account.passwordHash AS passwordHash');

        currentPasswordHash = 'old-password-hash';
        queries.length = 0;
        await expect(repository.issueSession(command)).resolves.toMatchObject({ sessionId: 'session-id' });
        expect(session.executeWrite).toHaveBeenCalledTimes(2);
        expect(queries[0]?.query).toContain('SET account.lockVersion = coalesce(account.lockVersion, 0) + 1');
        expect(queries[1]?.query).toContain('RETURN account.passwordHash AS passwordHash');
        expect(queries[2]?.query).toContain('CREATE (session:AccountSession');
    });

    it('keeps account deletion and rating ownership removal in one authenticated managed transaction', async () => {
        const { repository, queries, session } = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS accountId') && query.includes('session.active = true')) {
                return [record({ accountId: 'account-id' })];
            }
            return [];
        });

        await repository.deleteAccount('account-id', 'session-id', 'access-hash', 1_800_000_000_000);

        expect(session.executeWrite).toHaveBeenCalledOnce();
        expect(queries[0]?.query).toContain('session.active = true');
        expect(queries.some(({ query }) => query.includes('DELETE favorite'))).toBe(true);
        expect(queries.some(({ query }) => query.includes('SET rating.id') || query.includes('REMOVE rating'))).toBe(false);
        expect(queries.some(({ query }) => query.includes('DELETE ownRating'))).toBe(true);
        expect(queries.some(({ query }) => query.includes('DETACH DELETE account'))).toBe(true);
        expect(queries.at(-1)?.query).toContain('DETACH DELETE account');
    });

    it('does not continue account deletion after a transaction operation fails', async () => {
        const queries: string[] = [];
        const transaction = {
            run: vi.fn(async (query: string) => {
                queries.push(query);
                if (query.includes('session.active = true')) return { records: [record({ accountId: 'account-id' })] };
                if (query.includes('DELETE favorite')) throw new Error('graph unavailable');
                return { records: [] };
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

        await expect(repository.deleteAccount('account-id', 'session-id', 'access-hash', 1_800_000_000_000))
            .rejects.toThrow('graph unavailable');
        expect(queries.some((query) => query.includes('DETACH DELETE account'))).toBe(false);
        expect(session.executeWrite).toHaveBeenCalledOnce();
    });

    it('rotates refresh tokens and stores only hashes while extending the idle expiry', async () => {
        const now = 1_800_000_000_000;
        const currentToken = 'current-refresh-token';
        const { repository, queries } = repositoryWith((query) => {
            if (query.includes('RETURN session.id AS sessionId') && query.includes('session.refreshTokenHash = $refreshTokenHash')) {
                return [record({ sessionId: 'session-id' })];
            }
            if (query.includes('AS replay')) {
                return [record({
                    currentTokenHash: createHash('sha256').update(currentToken).digest('hex'),
                    replay: false,
                })];
            }
            if (query.includes('session.refreshTokenHash = $refreshTokenHash')) {
                return [record({ sessionId: 'session-id' })];
            }
            return [];
        });

        const result = await repository.refreshSession(currentToken, now);

        expect(result).not.toBeNull();
        expect(result?.sessionId).toBe('session-id');
        expect(result?.refreshToken).not.toBe(currentToken);
        const rotation = queries.at(-1);
        expect(rotation?.query).toContain('rotatedRefreshTokenHashes');
        expect(rotation?.query).toContain('session.expiresAt = $now + 30 * 24 * 60 * 60 * 1000');
        expect(rotation?.values?.refreshTokenHash).toBe(createHash('sha256').update(currentToken).digest('hex'));
        expect(rotation?.values?.refreshTokenHash).not.toBe(currentToken);
        expect(rotation?.values?.nextRefreshHash).not.toBe(result?.refreshToken);
    });

    it('revokes a session when a rotated refresh token is replayed', async () => {
        const { repository, queries } = repositoryWith((query) => {
            if (query.includes('RETURN session.id AS sessionId')) return [record({ sessionId: 'session-id' })];
            if (query.includes('AS replay')) return [record({ currentTokenHash: 'replacement-hash', replay: true })];
            return [];
        });

        await expect(repository.refreshSession('already-rotated', 1_800_000_000_000)).resolves.toBeNull();
        expect(queries.at(-1)?.query).toContain('session.active = false');
        expect(queries.at(-1)?.query).toContain('session.revokedAt = $now');
    });

    it('updates last-used time without extending the idle session window on access', async () => {
        const now = 1_800_000_000_000;
        const { repository, queries } = repositoryWith((query) => {
            if (query.includes('session.accessTokenHash = $accessTokenHash')) {
                return [record({
                    accountId: 'account-id',
                    sessionId: 'session-id',
                    accessTokenHash: 'stored-access-hash',
                })];
            }
            return [];
        });

        await expect(repository.validateAccessToken('access-token', now)).resolves.toEqual({
            accountId: 'account-id',
            sessionId: 'session-id',
            accessTokenHash: 'stored-access-hash',
        });
        expect(queries[0]?.query).toContain('session.lastUsedAt = $now');
        expect(queries[0]?.query).not.toContain('session.expiresAt =');
    });

    it('consumes recovery codes, updates the password, and revokes sessions atomically', async () => {
        const now = 1_800_000_000_000;
        const resetCommand: ResetPasswordCommand = {
            email: 'cook@example.test',
            codeHash: 'expected-code-hash',
            newPasswordHash: 'argon2id-new-hash',
            now,
        };
        const { repository, queries, session } = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS accountId')) return [record({ accountId: 'account-id' })];
            if (query.includes('RETURN challenge.id AS challengeId')) {
                return [record({
                    challengeId: 'challenge-id',
                    codeHash: 'expected-code-hash',
                    expiresAt: now + 60_000,
                    failedAttempts: 0,
                })];
            }
            return [];
        });

        await expect(repository.resetPassword(resetCommand)).resolves.toBe(true);

        expect(session.executeWrite).toHaveBeenCalledOnce();
        expect(queries.some(({ query }) => query.includes('SET account.passwordHash = $newPasswordHash'))).toBe(true);
        expect(queries.some(({ query }) => query.includes('challenge.active = false'))).toBe(true);
        expect(queries.some(({ query }) => query.includes('session.active = false'))).toBe(true);
        expect(queries.every(({ values }) => !JSON.stringify(values).includes('raw-password'))).toBe(true);
    });

    it('increments wrong recovery attempts without changing the password or sessions', async () => {
        const now = 1_800_000_000_000;
        const { repository, queries } = repositoryWith((query) => {
            if (query.includes('RETURN account.id AS accountId')) return [record({ accountId: 'account-id' })];
            if (query.includes('RETURN challenge.id AS challengeId')) {
                return [record({
                    challengeId: 'challenge-id',
                    codeHash: 'expected-code-hash',
                    expiresAt: now + 60_000,
                    failedAttempts: 1,
                })];
            }
            return [];
        });

        await expect(repository.resetPassword({
            email: 'cook@example.test',
            codeHash: 'wrong-code-hash',
            newPasswordHash: 'unused-hash',
            now,
        })).resolves.toBe(false);
        expect(queries.some(({ query }) => query.includes('SET challenge.failedAttempts = challenge.failedAttempts + 1'))).toBe(true);
        expect(queries.some(({ query }) => query.includes('SET account.passwordHash ='))).toBe(false);
        expect(queries.some(({ query }) => query.includes('session.active = false'))).toBe(false);
    });

    it('updates the existing account rating instead of creating a second rating', async () => {
        const { repository, queries, session } = repositoryWith((query) => {
            if (query.includes('session.active = true')) return [record({ accountId: 'account-id' })];
            if (query.includes('MATCH (account:Account {id: $accountId})') && query.includes('MATCH (recipe:Recipe')) {
                return [record({ accountId: 'account-id' })];
            }
            if (query.includes('RETURN count(rating) AS updated')) return [record({ updated: 1 })];
            return [];
        });

        await repository.setRating({
            accountId: 'account-id',
            sessionId: 'session-id',
            accessTokenHash: 'access-hash',
            recipeId: 'recipe-id',
            value: 4,
            now: 1_800_000_000_000,
        });

        expect(session.executeWrite).toHaveBeenCalledOnce();
        expect(queries.some(({ query }) => query.includes('SET rating.value = $value'))).toBe(true);
        expect(queries.some(({ query }) => query.includes('CREATE (rating:Rating'))).toBe(false);
    });
});
