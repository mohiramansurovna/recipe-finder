import type { Driver, ManagedTransaction } from 'neo4j-driver';
import { describe, expect, it, vi } from 'vitest';

import type { RegisterAccountCommand } from '../api/src/core/accounts/accounts.repository.js';
import { Neo4jAccountsRepository } from '../api/src/infrastructure/neo4j/repositories/accounts.neo4j.repository.js';

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
        const transaction = {
            run: vi.fn(async (query: string, values?: Record<string, unknown>) => {
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
    });
});
