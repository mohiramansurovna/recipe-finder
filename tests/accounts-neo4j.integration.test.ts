import { randomUUID } from 'node:crypto';
import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';
import { describe, expect, it } from 'vitest';

import {
    hashRecoveryCode,
    hashVerificationCode,
} from '../api/src/application/services/accounts.service.js';
import type { RegisterAccountCommand } from '../api/src/core/accounts/accounts.repository.js';
import { SessionExpiredError } from '../api/src/core/accounts/accounts.errors.js';
import { Neo4jAccountsRepository } from '../api/src/infrastructure/neo4j/repositories/accounts.neo4j.repository.js';
import { Neo4jRecipesRepository } from '../api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.js';

const testConfig =
    process.env['NEO4J_ACCOUNT_TEST_URI'] !== undefined &&
    process.env['NEO4J_ACCOUNT_TEST_USER'] !== undefined &&
    process.env['NEO4J_ACCOUNT_TEST_PASSWORD'] !== undefined
        ? {
            uri: process.env['NEO4J_ACCOUNT_TEST_URI'],
            username: process.env['NEO4J_ACCOUNT_TEST_USER'],
            password: process.env['NEO4J_ACCOUNT_TEST_PASSWORD'],
            database: process.env['NEO4J_ACCOUNT_TEST_DATABASE'] || 'neo4j',
        }
        : undefined;

describe.skipIf(testConfig === undefined)('Neo4j account lifecycle integration', () => {
    it('authenticates mutations, combines ratings, and deletes personal state atomically', async () => {
        if (testConfig === undefined) {
            throw new Error(
                'Set NEO4J_ACCOUNT_TEST_URI, NEO4J_ACCOUNT_TEST_USER, and NEO4J_ACCOUNT_TEST_PASSWORD.',
            );
        }
        const driver: Driver = neo4j.driver(
            testConfig.uri,
            neo4j.auth.basic(testConfig.username, testConfig.password),
        );
        const database = testConfig.database;
        const accountId = `account-test-${randomUUID()}`;
        const email = `${randomUUID()}@account-test.invalid`;
        const username = `t${randomUUID().replaceAll('-', '').slice(0, 20)}`;
        const recipeId = `account-test-${randomUUID()}`;
        const googleAccountId = `account-test-${randomUUID()}`;
        const googleEmail = `${randomUUID()}@google-account-test.invalid`;
        const googleUsername = `g${randomUUID().replaceAll('-', '').slice(0, 20)}`;
        const googleSubject = `google-test-${randomUUID()}`;
        const now = Date.now();
        const ipRateKeys: string[] = [];
        const repository = new Neo4jAccountsRepository(driver, database);

        try {
            await repository.assertReady();
            const seed = driver.session({ database });
            try {
                const collision = await seed.run(
                    `OPTIONAL MATCH (account:Account {id: $accountId})
                     OPTIONAL MATCH (recipe:Recipe {id: $recipeId})
                     RETURN count(account) + count(recipe) AS count`,
                    { accountId, recipeId },
                );
                const collisionCount: unknown = collision.records[0]?.get('count');
                if (neo4j.isInt(collisionCount) && collisionCount.toNumber() !== 0) {
                    throw new Error('Generated account integration identifiers already exist.');
                }
                await seed.executeWrite(async (transaction) => {
                    await transaction.run(
                        `CREATE (recipe:Recipe {id: $recipeId, name: 'Account lifecycle test recipe'})
                         CREATE (recipe)-[:HAS_RATING]->(:Rating {value: 2})`,
                        { recipeId },
                    );
                });
            } finally {
                await seed.close();
            }

            const registrationCode = '12345678';
            const registrationSecret = 'local-account-registration-test-secret';
            const registrationIpRateKey = randomUUID();
            ipRateKeys.push(`ip:${registrationIpRateKey}`);
            const registration: RegisterAccountCommand = {
                accountId,
                challengeId: randomUUID(),
                email,
                username,
                passwordHash: 'test-argon2id-hash',
                codeHash: hashVerificationCode(registrationSecret, email, registrationCode),
                codeExpiresAt: now + 24 * 60 * 60 * 1000,
                now,
                accountRateKey: accountId,
                ipRateKey: registrationIpRateKey,
            };
            await expect(repository.register(registration)).resolves.toBe('created');
            await expect(repository.register({
                ...registration,
                accountId: `duplicate-${randomUUID()}`,
                challengeId: randomUUID(),
                username: `d${randomUUID().replaceAll('-', '').slice(0, 20)}`,
            })).resolves.toBe('duplicate');
            await expect(repository.verify({
                email,
                codeHash: hashVerificationCode(registrationSecret, email, registrationCode),
                now: now + 1,
            })).resolves.toBe(true);
            await expect(repository.verify({
                email,
                codeHash: hashVerificationCode(registrationSecret, email, registrationCode),
                now: now + 2,
            })).resolves.toBe(false);

            const tokens = await repository.issueSession({
                accountId,
                deviceName: 'Account integration test',
                accessToken: randomUUID(),
                refreshToken: randomUUID(),
                now,
                expectedPasswordHash: 'test-argon2id-hash',
            });
            if (tokens === null) throw new Error('The initial test password hash was not accepted.');
            const replayTokens = await repository.issueSession({
                accountId,
                deviceName: 'Refresh replay test',
                accessToken: randomUUID(),
                refreshToken: randomUUID(),
                now,
            });
            if (replayTokens === null) throw new Error('The refresh replay test session was not created.');
            const refreshResults = await Promise.all([
                repository.refreshSession(replayTokens.refreshToken, now + 1),
                repository.refreshSession(replayTokens.refreshToken, now + 1),
            ]);
            expect(refreshResults.filter((result) => result !== null)).toHaveLength(1);
            await expect(repository.validateAccessToken(replayTokens.accessToken, now + 2)).resolves.toBeNull();
            const replacementTokens = refreshResults.find((result) => result !== null);
            if (replacementTokens !== undefined) {
                await expect(repository.validateAccessToken(replacementTokens.accessToken, now + 2)).resolves.toBeNull();
            }

            const claim = await repository.validateAccessToken(tokens.accessToken, now + 1);
            expect(claim).toMatchObject({ accountId, sessionId: tokens.sessionId });
            if (claim === null) throw new Error('The newly issued test session was not authenticated.');
            const remoteTokens = await repository.issueSession({
                accountId,
                deviceName: 'Remote session test',
                accessToken: randomUUID(),
                refreshToken: randomUUID(),
                now: now + 1,
            });
            if (remoteTokens === null) throw new Error('The remote test session was not created.');
            const remoteClaim = await repository.validateAccessToken(remoteTokens.accessToken, now + 2);
            expect(remoteClaim?.sessionId).toBe(remoteTokens.sessionId);
            await repository.revokeSession(
                accountId,
                claim.sessionId,
                claim.accessTokenHash,
                remoteTokens.sessionId,
                now + 3,
            );
            await expect(repository.validateAccessToken(remoteTokens.accessToken, now + 4)).resolves.toBeNull();

            const favoriteResults = await Promise.all([
                repository.addFavorite({
                    accountId,
                    sessionId: claim.sessionId,
                    accessTokenHash: claim.accessTokenHash,
                    recipeId,
                    now: now + 5,
                }),
                repository.addFavorite({
                    accountId,
                    sessionId: claim.sessionId,
                    accessTokenHash: claim.accessTokenHash,
                    recipeId,
                    now: now + 5,
                }),
            ]);
            expect(favoriteResults.slice().sort()).toEqual([false, true]);
            await repository.setRating({
                accountId,
                sessionId: claim.sessionId,
                accessTokenHash: claim.accessTokenHash,
                recipeId,
                value: 3,
                now: now + 6,
            });
            await repository.setRating({
                accountId,
                sessionId: claim.sessionId,
                accessTokenHash: claim.accessTokenHash,
                recipeId,
                value: 5,
                now: now + 7,
            });
            await Promise.all([4, 5].map((value) => repository.setRating({
                accountId,
                sessionId: claim.sessionId,
                accessTokenHash: claim.accessTokenHash,
                recipeId,
                value,
                now: now + 8,
            })));

            await expect(repository.getProfile(
                accountId,
                claim.sessionId,
                claim.accessTokenHash,
                now + 9,
            )).resolves.toEqual({ email, username });
            await expect(repository.listFavorites(
                accountId,
                claim.sessionId,
                claim.accessTokenHash,
                now + 9,
            )).resolves.toMatchObject([{ id: recipeId, name: 'Account lifecycle test recipe' }]);
            const currentRating = await repository.getRating({
                accountId,
                sessionId: claim.sessionId,
                accessTokenHash: claim.accessTokenHash,
                recipeId,
                value: 0,
                now: now + 9,
            });
            expect([4, 5]).toContain(currentRating);

            const recipes = new Neo4jRecipesRepository(driver, database);
            const ratedDetail = await recipes.getRecipeDetail(recipeId);
            expect((ratedDetail?.ratings.individual ?? []).slice().sort((a, b) => a - b)).toEqual([2, currentRating]);
            expect(ratedDetail?.ratings.aggregate).toBe((2 + (currentRating ?? 0)) / 2);

            const recoveryCode = '01234567';
            const recoverySecret = 'local-account-graph-test-secret';
            const recoveryChallenge = randomUUID();
            const recoveryIpRateKey = randomUUID();
            ipRateKeys.push(`ip:${recoveryIpRateKey}`);
            expect(await repository.requestRecovery({
                email,
                challengeId: recoveryChallenge,
                codeHash: hashRecoveryCode(recoverySecret, email, recoveryCode),
                codeExpiresAt: now + 60 * 60 * 1000,
                now: now + 10,
                ipRateKey: recoveryIpRateKey,
            })).toBe('issued');
            await expect(repository.resetPassword({
                email,
                codeHash: 'wrong-code-hash',
                newPasswordHash: 'unused-password-hash',
                now: now + 11,
            })).resolves.toBe(false);
            await expect(repository.resetPassword({
                email,
                codeHash: hashRecoveryCode(recoverySecret, email, recoveryCode),
                newPasswordHash: 'new-argon2id-test-hash',
                now: now + 12,
            })).resolves.toBe(true);
            await expect(repository.issueSession({
                accountId,
                deviceName: 'Stale password sign-in test',
                accessToken: randomUUID(),
                refreshToken: randomUUID(),
                now: now + 12,
                expectedPasswordHash: 'test-argon2id-hash',
            })).resolves.toBeNull();
            await expect(repository.resetPassword({
                email,
                codeHash: hashRecoveryCode(recoverySecret, email, recoveryCode),
                newPasswordHash: 'reused-code-hash',
                now: now + 13,
            })).resolves.toBe(false);
            const expiredCode = '11112222';
            const expiredCodeIpRateKey = randomUUID();
            ipRateKeys.push(`ip:${expiredCodeIpRateKey}`);
            expect(await repository.requestRecovery({
                email,
                challengeId: randomUUID(),
                codeHash: hashRecoveryCode(recoverySecret, email, expiredCode),
                codeExpiresAt: now + 15,
                now: now + 14,
                ipRateKey: expiredCodeIpRateKey,
            })).toBe('issued');
            await expect(repository.resetPassword({
                email,
                codeHash: hashRecoveryCode(recoverySecret, email, expiredCode),
                newPasswordHash: 'expired-code-hash',
                now: now + 15,
            })).resolves.toBe(false);
            const exhaustedCode = '33334444';
            const exhaustedCodeIpRateKey = randomUUID();
            ipRateKeys.push(`ip:${exhaustedCodeIpRateKey}`);
            expect(await repository.requestRecovery({
                email,
                challengeId: randomUUID(),
                codeHash: hashRecoveryCode(recoverySecret, email, exhaustedCode),
                codeExpiresAt: now + 60 * 60 * 1000,
                now: now + 16,
                ipRateKey: exhaustedCodeIpRateKey,
            })).toBe('issued');
            for (let attempt = 0; attempt < 5; attempt += 1) {
                await expect(repository.resetPassword({
                    email,
                    codeHash: 'wrong-recovery-code',
                    newPasswordHash: 'unused-password-hash',
                    now: now + 17 + attempt,
                })).resolves.toBe(false);
            }
            await expect(repository.resetPassword({
                email,
                codeHash: hashRecoveryCode(recoverySecret, email, exhaustedCode),
                newPasswordHash: 'exhausted-code-hash',
                now: now + 22,
            })).resolves.toBe(false);
            await expect(repository.validateAccessToken(tokens.accessToken, now + 23)).resolves.toBeNull();

            const deletionTokens = await repository.issueSession({
                accountId,
                deviceName: 'Deletion test',
                accessToken: randomUUID(),
                refreshToken: randomUUID(),
                now: now + 24,
            });
            if (deletionTokens === null) throw new Error('The deletion test session was not created.');
            const deletionClaim = await repository.validateAccessToken(deletionTokens.accessToken, now + 25);
            expect(deletionClaim).not.toBeNull();
            if (deletionClaim === null) throw new Error('The post-reset test session was not authenticated.');
            await expect(repository.listSessions(
                accountId,
                deletionClaim.sessionId,
                deletionClaim.accessTokenHash,
                now + 26,
            )).resolves.toMatchObject([{ sessionId: deletionClaim.sessionId, current: false }]);

            await repository.deleteAccount(
                accountId,
                deletionClaim.sessionId,
                deletionClaim.accessTokenHash,
                now + 27,
            );
            await expect(repository.validateAccessToken(deletionTokens.accessToken, now + 28)).resolves.toBeNull();
            await expect(repository.addFavorite({
                accountId,
                sessionId: deletionClaim.sessionId,
                accessTokenHash: deletionClaim.accessTokenHash,
                recipeId,
                now: now + 28,
            })).rejects.toBeInstanceOf(SessionExpiredError);
            const anonymousDetail = await recipes.getRecipeDetail(recipeId);
            expect((anonymousDetail?.ratings.individual ?? []).slice().sort((a, b) => a - b)).toEqual([2, currentRating]);
            expect(anonymousDetail?.ratings.aggregate).toBe((2 + (currentRating ?? 0)) / 2);

            const googleVerificationCode = '87654321';
            const googleVerificationSecret = 'google-account-test-secret';
            const googleChallengeId = randomUUID();
            await repository.createGoogleAccount({
                accountId: googleAccountId,
                username: googleUsername,
                email: googleEmail,
                subject: googleSubject,
                emailVerified: false,
                now: now + 29,
                challengeId: googleChallengeId,
                codeHash: hashVerificationCode(
                    googleVerificationSecret,
                    googleEmail,
                    googleVerificationCode,
                ),
                codeExpiresAt: now + 24 * 60 * 60 * 1000,
            });
            await expect(repository.getGoogleAccount(googleSubject)).resolves.toMatchObject({
                accountId: googleAccountId,
                email: googleEmail,
                username: googleUsername,
                emailVerified: false,
            });
            await expect(repository.verify({
                email: googleEmail,
                codeHash: hashVerificationCode(
                    googleVerificationSecret,
                    googleEmail,
                    googleVerificationCode,
                ),
                now: now + 30,
            })).resolves.toBe(true);
            await expect(repository.getGoogleAccount(googleSubject)).resolves.toMatchObject({
                accountId: googleAccountId,
                emailVerified: true,
            });
            const googleTokens = await repository.issueSession({
                accountId: googleAccountId,
                deviceName: 'Google integration test',
                accessToken: randomUUID(),
                refreshToken: randomUUID(),
                now: now + 31,
            });
            if (googleTokens === null) throw new Error('The Google test session was not created.');
            const googleClaim = await repository.validateAccessToken(googleTokens.accessToken, now + 32);
            expect(googleClaim?.accountId).toBe(googleAccountId);
            if (googleClaim === null) throw new Error('The Google test session was not authenticated.');
            await repository.deleteAccount(
                googleAccountId,
                googleClaim.sessionId,
                googleClaim.accessTokenHash,
                now + 33,
            );
            await expect(repository.validateAccessToken(googleTokens.accessToken, now + 34)).resolves.toBeNull();
        } finally {
            const cleanup = driver.session({ database });
            try {
                await cleanup.executeWrite(async (transaction) => {
                    await transaction.run(
                        `MATCH (account:Account {id: $accountId}) DETACH DELETE account`,
                        { accountId },
                    );
                    await transaction.run(
                        `MATCH (recipe:Recipe {id: $recipeId}) DETACH DELETE recipe`,
                        { recipeId },
                    );
                    await transaction.run(
                        `MATCH (account:Account {id: $accountId}) DETACH DELETE account`,
                        { accountId: googleAccountId },
                    );
                    await transaction.run(
                        `UNWIND $keys AS key
                         MATCH (quota:AccountRateLimit {key: key})
                         DETACH DELETE quota`,
                        { keys: ipRateKeys },
                    );
                });
            } finally {
                await cleanup.close();
                await driver.close();
            }
        }
    }, 30_000);
});
