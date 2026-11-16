import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import {
    AccountsService,
    hashRecoveryCode,
    hashSourceIp,
    hashVerificationCode,
} from '../api/src/application/services/accounts.service.js';
import type {
    AccountsRepository,
    RecoveryChallengeCommand,
    RecoveryResult,
    ResetPasswordCommand,
    RegisterAccountCommand,
    RegistrationResult,
    ResendResult,
    ResendVerificationCommand,
    VerifyAccountCommand,
} from '../api/src/core/accounts/accounts.repository.js';
import type { IngredientsRepository } from '../api/src/core/ingredients/ingredients.repository.js';
import { createApiApp } from '../api/src/app.js';
import type { PasswordHasher, VerificationMailer } from '../api/src/application/services/accounts.service.js';
import {
    AccountAlreadyExistsError,
    GoogleAccountCreationConflictError,
    GoogleIdentityProviderError,
    RecipeNotFoundError,
    SessionExpiredError,
} from '../api/src/core/accounts/accounts.errors.js';
import {
    Argon2PasswordHasher,
    HashConcurrencyLimiter,
} from '../api/src/infrastructure/accounts/argon2-password-hasher.js';
import { ResendVerificationMailer } from '../api/src/infrastructure/accounts/resend-verification-mailer.js';

class TestIngredientRepository implements IngredientsRepository {
    async getIngredientNames() {
        return [];
    }

    async getIngredientAliases() {
        return [];
    }

    async getIngredientCategories() {
        return [];
    }
}

class TestAccountsRepository implements AccountsRepository {
    registrationResult: RegistrationResult = 'created';
    resendResult: ResendResult = 'issued';
    verificationResult = true;
    committed = false;
    readonly registrations: RegisterAccountCommand[] = [];
    readonly resends: ResendVerificationCommand[] = [];
    readonly verifications: VerifyAccountCommand[] = [];
    recoveryResult: RecoveryResult = 'issued';
    readonly recoveries: RecoveryChallengeCommand[] = [];
    resetResult = true;
    readonly resets: ResetPasswordCommand[] = [];

    async register(command: RegisterAccountCommand): Promise<RegistrationResult> {
        this.registrations.push(command);
        this.committed = this.registrationResult === 'created';
        return this.registrationResult;
    }

    async resendVerification(command: ResendVerificationCommand): Promise<ResendResult> {
        this.resends.push(command);
        return this.resendResult;
    }

    async verify(command: VerifyAccountCommand): Promise<boolean> {
        this.verifications.push(command);
        return this.verificationResult;
    }

    async requestRecovery(command: RecoveryChallengeCommand): Promise<RecoveryResult> {
        this.recoveries.push(command);
        return this.recoveryResult;
    }

    async resetPassword(command: ResetPasswordCommand): Promise<boolean> {
        this.resets.push(command);
        return this.resetResult;
    }

    async assertReady(): Promise<void> {}
}

class TestMailer implements VerificationMailer {
    readonly deliveries: { email: string; code: string; idempotencyKey: string }[] = [];
    readonly recoveryDeliveries: { email: string; code: string; idempotencyKey: string }[] = [];
    failure: Error | undefined;
    constructor(private readonly isCommitted: () => boolean = () => true) {}

    async sendVerificationEmail(email: string, code: string, idempotencyKey: string): Promise<void> {
        expect(this.isCommitted()).toBe(true);
        this.deliveries.push({ email, code, idempotencyKey });
        if (this.failure !== undefined) throw this.failure;
    }

    async sendRecoveryEmail(email: string, code: string, idempotencyKey: string): Promise<void> {
        this.recoveryDeliveries.push({ email, code, idempotencyKey });
        if (this.failure !== undefined) throw this.failure;
    }
}

class TestPasswordHasher implements PasswordHasher {
    async hash(password: string): Promise<string> {
        return `hash:${createHash('sha256').update(password).digest('hex')}`;
    }

    async verify(passwordHash: string, password: string): Promise<boolean> {
        return passwordHash === await this.hash(password);
    }
}

function createTestApp(repository = new TestAccountsRepository(), mailer = new TestMailer()) {
    const accountsService = new AccountsService({
        repository,
        passwordHasher: new TestPasswordHasher(),
        mailer,
        verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
        now: () => 1_800_000_000_000,
        createCode: () => '01234567',
    });
    return { app: createApiApp(new TestIngredientRepository(), 100, undefined, accountsService), repository, mailer };
}

const credentials = {
    email: '  Cook@Example.com ',
    username: 'Home_Cook',
    password: 'a-long-password',
};

describe('account registration API', () => {
    it('normalizes identity fields, hashes the password, commits before delivery, and never returns the code', async () => {
        const repository = new TestAccountsRepository();
        const mailer = new TestMailer(() => repository.committed);
        const { app } = createTestApp(repository, mailer);

        const response = await request(app)
            .post('/api/accounts/register')
            .send(credentials)
            .expect(201);

        expect(response.body).toEqual({ message: 'Check your email to verify your account.' });
        expect(JSON.stringify(response.body)).not.toContain('01234567');
        expect(repository.registrations[0]).toMatchObject({
            email: 'cook@example.com',
            username: 'home_cook',
            passwordHash: await new TestPasswordHasher().hash(credentials.password),
            codeHash: hashVerificationCode(
                'a-secret-for-verification-tests-that-is-long-enough',
                'cook@example.com',
                '01234567',
            ),
            codeExpiresAt: 1_800_000_000_000 + 24 * 60 * 60 * 1000,
        });
        expect(repository.registrations[0]?.passwordHash).not.toContain(credentials.password);
        expect(mailer.deliveries).toHaveLength(1);
        expect(mailer.deliveries[0]).toMatchObject({ email: 'cook@example.com', code: '01234567' });
    });

    it('binds verification-code hashes to the normalized account email', () => {
        const secret = 'a-secret-for-verification-tests-that-is-long-enough';
        expect(hashVerificationCode(secret, 'Cook@Example.com', '01234567')).toBe(
            hashVerificationCode(secret, 'cook@example.com', '01234567'),
        );
        expect(hashVerificationCode(secret, 'other@example.com', '01234567')).not.toBe(
            hashVerificationCode(secret, 'cook@example.com', '01234567'),
        );
        expect(hashRecoveryCode(secret, 'cook@example.com', '01234567')).not.toBe(
            hashVerificationCode(secret, 'cook@example.com', '01234567'),
        );
    });

    it.each([
        { ...credentials, username: 'ab' },
        { ...credentials, username: 'bad-name' },
        { ...credentials, username: 'ééé' },
        { ...credentials, username: 'Kelvin' },
        { ...credentials, password: 'short' },
        { ...credentials, password: '😀😀😀😀😀😀' },
        { ...credentials, password: undefined },
        { ...credentials, unexpected: true },
    ])('rejects invalid registration input without persisting an account', async (body) => {
        const { app, repository, mailer } = createTestApp();
        await request(app).post('/api/accounts/register').send(body).expect(400);
        expect(repository.registrations).toHaveLength(0);
        expect(mailer.deliveries).toHaveLength(0);
    });

    it('returns a safe duplicate result without sending a verification email', async () => {
        const repository = new TestAccountsRepository();
        repository.registrationResult = 'duplicate';
        const { app, mailer } = createTestApp(repository);
        await request(app)
            .post('/api/accounts/register')
            .send(credentials)
            .expect(409)
            .expect({
                error: {
                    code: 'ACCOUNT_ALREADY_EXISTS',
                    message: 'An account with that email or username already exists.',
                },
            });
        expect(mailer.deliveries).toHaveLength(0);
    });

    it('reports a committed account when delivery fails without returning a code', async () => {
        const repository = new TestAccountsRepository();
        const mailer = new TestMailer(() => repository.committed);
        mailer.failure = new Error('provider failed');
        const { app } = createTestApp(repository, mailer);

        const response = await request(app)
            .post('/api/accounts/register')
            .send(credentials)
            .expect(503);

        expect(response.body.error.code).toBe('EMAIL_DELIVERY_FAILED');
        expect(JSON.stringify(response.body)).not.toContain('01234567');
        expect(repository.committed).toBe(true);
    });

    it('forwards unexpected registration failures to the central error logger', async () => {
        const repository = new TestAccountsRepository();
        const failure = new Error('Neo4j unavailable');
        vi.spyOn(repository, 'register').mockRejectedValue(failure);
        const { app } = createTestApp(repository);
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            await request(app)
                .post('/api/accounts/register')
                .send(credentials)
                .expect(500)
                .expect({
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'The request could not be completed.',
                    },
                });
            expect(log).toHaveBeenCalledWith('Unhandled API request error:', failure);
        } finally {
            log.mockRestore();
        }
    });

    it('maps invalid verification codes to a safe client error', async () => {
        const repository = new TestAccountsRepository();
        repository.verificationResult = false;
        const { app } = createTestApp(repository);
        await request(app)
            .post('/api/accounts/verify')
            .send({ email: 'COOK@example.com', code: '99999999' })
            .expect(400)
            .expect({
                error: {
                    code: 'INVALID_VERIFICATION_CODE',
                    message: 'The verification code is invalid, expired, or no longer usable.',
                },
            });
        expect(repository.verifications[0]?.email).toBe('cook@example.com');
    });

    it('verifies a valid code without returning credentials', async () => {
        const { app, repository } = createTestApp();
        const response = await request(app)
            .post('/api/accounts/verify')
            .send({ email: 'COOK@example.com', code: '01234567' })
            .expect(200);
        expect(response.body).toEqual({ message: 'Email verified.' });
        expect(repository.verifications[0]?.codeHash).toBe(
            hashVerificationCode(
                'a-secret-for-verification-tests-that-is-long-enough',
                'cook@example.com',
                '01234567',
            ),
        );
        expect(JSON.stringify(response.body)).not.toContain('01234567');
    });

    it('returns the same response for eligible and unknown resend addresses', async () => {
        const eligible = createTestApp();
        const unknownRepository = new TestAccountsRepository();
        unknownRepository.resendResult = 'ineligible';
        const unknown = createTestApp(unknownRepository);
        const body = { email: 'cook@example.com' };

        const eligibleResponse = await request(eligible.app)
            .post('/api/accounts/resend-verification')
            .send(body)
            .expect(202);
        const unknownResponse = await request(unknown.app)
            .post('/api/accounts/resend-verification')
            .send(body)
            .expect(202);

        expect(eligibleResponse.status).toBe(unknownResponse.status);
        expect(eligibleResponse.body).toEqual(unknownResponse.body);
        expect(eligible.mailer.deliveries).toHaveLength(1);
        expect(unknown.mailer.deliveries).toHaveLength(0);
    });

    it('does not expose resend delivery failure or account eligibility', async () => {
        const onFailure = vi.fn();
        const repository = new TestAccountsRepository();
        const mailer = new TestMailer();
        mailer.failure = new Error('provider failure');
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer,
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            createCode: () => '01234567',
            onResendDeliveryFailure: onFailure,
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);
        const response = await request(app)
            .post('/api/accounts/resend-verification')
            .send({ email: 'cook@example.com' })
            .expect(202);
        expect(response.body).toEqual({
            message: 'If the account is eligible, a verification email will be sent.',
        });
        expect(onFailure).toHaveBeenCalledWith(repository.resends[0]?.challengeId, mailer.failure);
        expect(JSON.stringify(response.body)).not.toContain('01234567');
    });

    it('keeps rate-limited resend responses indistinguishable from unknown accounts', async () => {
        const limitedRepository = new TestAccountsRepository();
        limitedRepository.resendResult = 'rate-limited';
        const limited = createTestApp(limitedRepository);
        const unknownRepository = new TestAccountsRepository();
        unknownRepository.resendResult = 'ineligible';
        const unknown = createTestApp(unknownRepository);
        const body = { email: 'cook@example.com' };
        const [limitedResponse, unknownResponse] = await Promise.all([
            request(limited.app).post('/api/accounts/resend-verification').send(body).expect(202),
            request(unknown.app).post('/api/accounts/resend-verification').send(body).expect(202),
        ]);
        expect(limitedResponse.body).toEqual(unknownResponse.body);
        expect(limited.mailer.deliveries).toHaveLength(0);
    });

    it('sends recovery codes with the recovery template and hides known-account delivery failure', async () => {
        const repository = new TestAccountsRepository();
        const mailer = new TestMailer();
        mailer.failure = new Error('provider failure');
        const onFailure = vi.fn();
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer,
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            createCode: () => '01234567',
            now: () => 1_800_000_000_000,
            onRecoveryDeliveryFailure: onFailure,
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);
        const known = await request(app)
            .post('/api/accounts/recover')
            .send({ email: 'COOK@example.com' })
            .expect(202);

        repository.recoveryResult = 'not-found';
        const unknown = await request(app)
            .post('/api/accounts/recover')
            .send({ email: 'unknown@example.com' })
            .expect(202);

        expect(known.body).toEqual(unknown.body);
        expect(mailer.deliveries).toHaveLength(0);
        expect(mailer.recoveryDeliveries).toEqual([{
            email: 'cook@example.com',
            code: '01234567',
            idempotencyKey: repository.recoveries[0]?.challengeId,
        }]);
        expect(repository.recoveries[0]).toMatchObject({
            email: 'cook@example.com',
            codeHash: hashRecoveryCode(
                'a-secret-for-verification-tests-that-is-long-enough',
                'cook@example.com',
                '01234567',
            ),
            codeExpiresAt: 1_800_000_000_000 + 60 * 60 * 1000,
        });
        await vi.waitFor(() => {
            expect(onFailure).toHaveBeenCalledWith(repository.recoveries[0]?.challengeId, mailer.failure);
        });
        expect(JSON.stringify(known.body)).not.toContain('01234567');
    });

    it('does not wait for recovery email delivery before returning the non-enumerating response', async () => {
        const repository = new TestAccountsRepository();
        const mailer = new TestMailer();
        let completeDelivery: (() => void) | undefined;
        mailer.sendRecoveryEmail = async () =>
            new Promise<void>((resolve) => {
                completeDelivery = resolve;
            });
        const { app } = createTestApp(repository, mailer);

        await request(app)
            .post('/api/accounts/recover')
            .send({ email: 'cook@example.com' })
            .expect(202);

        expect(completeDelivery).toBeTypeOf('function');
        completeDelivery?.();
    });

    it('hashes replacement passwords and consumes recovery codes through the repository', async () => {
        const repository = new TestAccountsRepository();
        const { app } = createTestApp(repository);
        const response = await request(app)
            .post('/api/accounts/reset-password')
            .send({
                email: 'COOK@example.com',
                code: '01234567',
                password: 'a-new-long-password',
            })
            .expect(200);

        expect(response.body).toEqual({ message: 'Password reset complete.' });
        expect(repository.resets[0]).toMatchObject({
            email: 'cook@example.com',
            codeHash: hashRecoveryCode(
                'a-secret-for-verification-tests-that-is-long-enough',
                'cook@example.com',
                '01234567',
            ),
            newPasswordHash: await new TestPasswordHasher().hash('a-new-long-password'),
        });
        expect(JSON.stringify(repository.resets[0])).not.toContain('a-new-long-password');
    });

    it('hashes source IPs without storing raw addresses', () => {
        const first = hashSourceIp('secret', '192.0.2.1');
        expect(first).not.toContain('192.0.2.1');
        expect(first).not.toBe(hashSourceIp('secret', '192.0.2.2'));
    });

    it('marks health unavailable when readiness checks fail', async () => {
        const repository = new TestAccountsRepository();
        const mailer = new TestMailer();
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer,
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
        });
        const unavailable = createApiApp(
            new TestIngredientRepository(),
            100,
            undefined,
            service,
            async () => {
                throw new Error('schema missing');
            },
        );
        await request(unavailable).get('/health').expect(503).expect({ status: 'error' });
    });
});

describe('Argon2id password hashing', () => {
    it('stores an Argon2id hash instead of the raw password', async () => {
        const password = 'correct-horse-battery-staple';
        const hash = await new Argon2PasswordHasher().hash(password);
        expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/u);
        expect(hash).not.toContain(password);
    });

    it('bounds concurrent password hash operations', async () => {
        const limiter = new HashConcurrencyLimiter(2);
        let active = 0;
        let peak = 0;
        await Promise.all(Array.from({ length: 8 }, () => limiter.run(async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active -= 1;
        })));
        expect(peak).toBe(2);
    });
});

describe('Resend verification mail adapter', () => {
    it('sends verification mail with a provider idempotency key', async () => {
        let url: string | URL | Request | undefined;
        let options: RequestInit | undefined;
        vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
            url = input;
            options = init;
            return new Response(null, { status: 200 });
        });
        try {
            await new ResendVerificationMailer('resend-test-key', 'recipes@example.com')
                .sendVerificationEmail('cook@example.com', '01234567', 'challenge-123');
            expect(url).toBe('https://api.resend.com/emails');
            expect(options?.headers).toMatchObject({
                Authorization: 'Bearer resend-test-key',
                'Content-Type': 'application/json',
                'Idempotency-Key': 'challenge-123',
            });
            expect(JSON.parse(options?.body as string)).toMatchObject({
                from: 'recipes@example.com',
                to: ['cook@example.com'],
                text: expect.stringContaining('01234567'),
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reports provider delivery failure without echoing the verification code', async () => {
        vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }));
        try {
            await expect(new ResendVerificationMailer('resend-test-key', 'recipes@example.com')
                .sendVerificationEmail('cook@example.com', '01234567', 'challenge-123'))
                .rejects.toThrow('Resend returned HTTP 503.');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('sends password recovery codes with the correct message and expiry', async () => {
        let options: RequestInit | undefined;
        vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
            options = init;
            return new Response(null, { status: 200 });
        });
        try {
            await new ResendVerificationMailer('resend-test-key', 'recipes@example.com')
                .sendRecoveryEmail('cook@example.com', '01234567', 'recovery-challenge');
            expect(JSON.parse(options?.body as string)).toMatchObject({
                subject: 'Reset your Recipe Graph password',
                text: 'Your password reset code is 01234567. It expires in 1 hour.',
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});


describe('Google sign-in contract and session lifecycle', () => {
    it('returns opaque tokens for valid sign-in and no session for invalid credentials', async () => {
        let sessionCount = 0;
        const repository = {
            async getPasswordAccountForSignIn() {
                return {
                    accountId: 'account-1',
                    passwordHash: await new TestPasswordHasher().hash('a-long-password'),
                    emailVerified: true,
                    authMethod: 'password' as const,
                };
            },
            async issueSession(command: { accountId: string; deviceName: string; accessToken: string; refreshToken: string }) {
                sessionCount += 1;
                expect(command.accountId).toBe('account-1');
                return {
                    sessionId: 'session-1',
                    accessToken: command.accessToken,
                    refreshToken: command.refreshToken,
                };
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            now: () => 1_800_000_000_000,
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        const valid = await request(app)
            .post('/api/accounts/sign-in')
            .send({ email: 'cook@example.test', password: 'a-long-password', deviceName: 'Pixel' })
            .expect(200);
        expect(valid.body).toMatchObject({ sessionId: 'session-1' });
        expect(valid.body.accessToken).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
        expect(valid.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
        expect(valid.body).not.toHaveProperty('email');

        await request(app)
            .post('/api/accounts/sign-in')
            .send({ email: 'cook@example.test', password: 'b-long-password', deviceName: 'Pixel' })
            .expect(401);
        expect(sessionCount).toBe(1);
    });

    it('issues a session only after a verified password account authenticates', async () => {
        let sessionCommand: {
            accountId: string;
            deviceName: string;
            accessToken: string;
            refreshToken: string;
        } | undefined;
        let accountVerified = true;
        const repository = {
            async getPasswordAccountForSignIn() {
                return {
                    accountId: 'account-1',
                    passwordHash: await new TestPasswordHasher().hash('a-long-password'),
                    emailVerified: accountVerified,
                    authMethod: 'password' as const,
                };
            },
            async issueSession(command: {
                accountId: string;
                deviceName: string;
                accessToken: string;
                refreshToken: string;
            }) {
                sessionCommand = command;
                return { sessionId: 'session-1', accessToken: command.accessToken, refreshToken: command.refreshToken };
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            now: () => 1_800_000_000_000,
        });

        const tokens = await service.signIn({
            email: ' COOK@example.com ',
            password: 'a-long-password',
            deviceName: 'Pixel',
        });
        expect(tokens).not.toBeNull();
        expect(sessionCommand).toMatchObject({ accountId: 'account-1', deviceName: 'Pixel' });
        expect(sessionCommand?.accessToken).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
        expect(sessionCommand?.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/u);

        accountVerified = false;
        sessionCommand = undefined;
        await expect(service.signIn({ email: 'cook@example.com', password: 'a-long-password' })).resolves.toBeNull();
        expect(sessionCommand).toBeUndefined();
    });

    it('requires email verification for a non-authoritative Google address', async () => {
        let createdAccount: {
            emailVerified: boolean;
            challengeId?: string;
            codeHash?: string;
            codeExpiresAt?: number;
        } | undefined;
        let sessionIssued = false;
        const repository = {
            async getPasswordAccountForSignIn() { return null; },
            async getGoogleAccount() { return null; },
            async createGoogleAccount(command: {
                emailVerified: boolean;
                challengeId?: string;
                codeHash?: string;
                codeExpiresAt?: number;
            }) {
                createdAccount = command;
                return {
                    accountId: 'google-account',
                    email: 'cook@company.test',
                    username: 'home_cook',
                    emailVerified: command.emailVerified,
                };
            },
            async issueSession() {
                sessionIssued = true;
                return { sessionId: 'session-1', accessToken: 'access-1', refreshToken: 'refresh-1' };
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const mailer = new TestMailer();
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer,
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            createCode: () => '01234567',
            now: () => 1_800_000_000_000,
            googleVerifier: {
                async verify() {
                    return { sub: 'google-123', email: 'cook@company.test', emailVerified: true };
                },
            },
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);
        const response = await request(app)
            .post('/api/accounts/google')
            .send({ idToken: 'signed-token', username: 'home_cook' })
            .expect(202);

        expect(response.body).toEqual({
            message: 'Check your email to verify your account before signing in.',
        });
        expect(createdAccount).toMatchObject({
            emailVerified: false,
            codeHash: hashVerificationCode(
                'a-secret-for-verification-tests-that-is-long-enough',
                'cook@company.test',
                '01234567',
            ),
            codeExpiresAt: 1_800_000_000_000 + 24 * 60 * 60 * 1000,
        });
        expect(createdAccount?.challengeId).toBeTruthy();
        expect(mailer.deliveries).toMatchObject([{ email: 'cook@company.test', code: '01234567' }]);
        expect(sessionIssued).toBe(false);
    });

    it('requires a valid user-selected username instead of falling back to the email prefix', async () => {
        const service = new AccountsService({
            repository: {
                async getPasswordAccountForSignIn() { return null; },
                async getGoogleAccount() { return null; },
                async createGoogleAccount() {
                    throw new Error('should not create without a valid username');
                },
                async issueSession() {
                    return { sessionId: 'session-1', accessToken: 'access-1', refreshToken: 'refresh-1' };
                },
                async assertReady() {},
            } as unknown as AccountsRepository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            googleVerifier: {
                async verify() {
                    return { sub: 'google-123', email: 'staff@gmail.com', emailVerified: true, hostedDomain: 'gmail.com' };
                },
            },
            now: () => 1_800_000_000_000,
        });

        await expect(service.googleSignIn({ idToken: 'token', deviceName: 'Pixel' }))
            .rejects.toThrow('Choose a username');
    });

    it('lets an existing Google account sign in without choosing a username again', async () => {
        const repository = {
            async getGoogleAccount() {
                return {
                    accountId: 'google-account',
                    email: 'cook@gmail.com',
                    username: 'home_cook',
                    emailVerified: true,
                };
            },
            async issueSession(command: { accountId: string; accessToken: string; refreshToken: string }) {
                return { sessionId: 'session-1', ...command };
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            googleVerifier: {
                async verify() {
                    return { sub: 'google-123', email: 'cook@gmail.com', emailVerified: true };
                },
            },
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        await request(app)
            .post('/api/accounts/google')
            .send({ idToken: 'signed-token' })
            .expect(200);
    });

    it('recognizes password-account conflicts before issuing a Google session', async () => {
        const service = new AccountsService({
            repository: {
                async getPasswordAccountForSignIn() {
                    return {
                        accountId: 'password-account',
                        passwordHash: 'hash',
                        emailVerified: true,
                        authMethod: 'password',
                    };
                },
                async getGoogleAccount() { return null; },
                async assertReady() {},
            } as unknown as AccountsRepository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            googleVerifier: {
                async verify() {
                    return { sub: 'google-123', email: 'staff@gmail.com', emailVerified: true, hostedDomain: 'gmail.com' };
                },
            },
            now: () => 1_800_000_000_000,
        });

        await expect(service.googleSignIn({ idToken: 'token', username: 'staff_user', deviceName: 'Pixel' }))
            .rejects.toThrow('This email is already registered with a password account.');
    });

    it('rechecks the sign-in method when Google account creation loses an email uniqueness race', async () => {
        let accountLookup = 0;
        const repository = {
            async getGoogleAccount() { return null; },
            async getPasswordAccountForSignIn() {
                accountLookup += 1;
                return accountLookup === 1
                    ? null
                    : {
                        accountId: 'password-account',
                        passwordHash: 'hash',
                        emailVerified: true,
                        authMethod: 'password' as const,
                    };
            },
            async createGoogleAccount() { throw new AccountAlreadyExistsError(); },
            async issueSession() {
                throw new Error('must not issue a session');
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            googleVerifier: {
                async verify() {
                    return { sub: 'google-subject', email: 'cook@example.test', emailVerified: true };
                },
            },
        });

        await expect(service.googleSignIn({ idToken: 'token', username: 'home_cook' }))
            .rejects.toThrow('This email is already registered with a password account.');
    });

    it('does not send an unsaved verification code when concurrent Google creation wins', async () => {
        let accountLookup = 0;
        const mailer = new TestMailer();
        const repository = {
            async getGoogleAccount() {
                accountLookup += 1;
                return accountLookup === 1
                    ? null
                    : {
                        accountId: 'google-account',
                        email: 'cook@example.test',
                        username: 'home_cook',
                        emailVerified: false,
                    };
            },
            async getPasswordAccountForSignIn() { return null; },
            async createGoogleAccount() { throw new GoogleAccountCreationConflictError(); },
            async issueSession() {
                throw new Error('must not issue a session');
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer,
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            googleVerifier: {
                async verify() {
                    return { sub: 'google-subject', email: 'cook@example.test', emailVerified: false };
                },
            },
        });

        await expect(service.googleSignIn({ idToken: 'token', username: 'home_cook' }))
            .resolves.toEqual({ verificationRequired: true, email: 'cook@example.test' });
        expect(mailer.deliveries).toHaveLength(0);
    });

    it('marks the current session in the list and supports terminating another session', async () => {
        const repository = {
            async assertReady() {},
            async validateAccessToken(accessToken: string) {
                return accessToken === 'current-access-token'
                    ? { accountId: 'account-1', sessionId: 'session-1', accessTokenHash: 'token-hash' }
                    : null;
            },
            async listSessions(accountId: string, sessionId: string) {
                expect(accountId).toBe('account-1');
                expect(sessionId).toBe('session-1');
                return [
                    { sessionId: 'session-1', deviceName: 'Pixel', createdAt: 1, lastUsedAt: 3, expiresAt: 10, current: false },
                    { sessionId: 'session-2', deviceName: 'Laptop', createdAt: 2, lastUsedAt: 4, expiresAt: 11, current: false },
                ];
            },
            async revokeSession(accountId: string, currentSessionId: string, accessTokenHash: string, sessionId: string) {
                expect(accountId).toBe('account-1');
                expect(currentSessionId).toBe('session-1');
                expect(accessTokenHash).toBe('token-hash');
                expect(sessionId).toBe('session-2');
            },
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
            now: () => 1_800_000_000_000,
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        const listResponse = await request(app)
            .get('/api/accounts/sessions')
            .set('Authorization', 'Bearer current-access-token')
            .expect(200);
        expect(listResponse.body.sessions).toEqual([
            { sessionId: 'session-1', deviceName: 'Pixel', createdAt: 1, lastUsedAt: 3, expiresAt: 10, current: true },
            { sessionId: 'session-2', deviceName: 'Laptop', createdAt: 2, lastUsedAt: 4, expiresAt: 11, current: false },
        ]);

        await request(app)
            .delete('/api/accounts/sessions/session-2')
            .set('Authorization', 'Bearer current-access-token')
            .expect(200)
            .expect({ sessionId: 'session-2', message: 'Session terminated.' });
    });

    it('returns an authentication error if the session expires while loading the session list', async () => {
        const repository = {
            async validateAccessToken() {
                return { accountId: 'account-1', sessionId: 'session-1', accessTokenHash: 'token-hash' };
            },
            async listSessions() {
                throw new SessionExpiredError();
            },
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        const response = await request(app)
            .get('/api/accounts/sessions')
            .set('Authorization', 'Bearer current-access-token')
            .expect(401);
        expect(response.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('accepts a case-insensitive bearer authentication scheme', async () => {
        const repository = {
            async validateAccessToken(accessToken: string) {
                return accessToken === 'current-access-token'
                    ? { accountId: 'account-1', sessionId: 'session-1', accessTokenHash: 'token-hash' }
                    : null;
            },
            async listSessions() { return []; },
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        await request(app)
            .get('/api/accounts/sessions')
            .set('Authorization', ['bearer', 'current-access-token'].join(' '))
            .expect(200)
            .expect({ sessions: [] });
    });
});

describe('account recipe mutation errors', () => {
    it('authenticates rating and favorite mutations and rejects invalid ratings', async () => {
        const ratings: number[] = [];
        let favoriteAdded = false;
        const repository = {
            async validateAccessToken() {
                return { accountId: 'account-1', sessionId: 'session-1', accessTokenHash: 'token-hash' };
            },
            async setRating(command: { accountId: string; recipeId: string; value: number }) {
                expect(command.accountId).toBe('account-1');
                expect(command.recipeId).toBe('recipe-1');
                ratings.push(command.value);
            },
            async addFavorite(command: { accountId: string; recipeId: string }) {
                expect(command.accountId).toBe('account-1');
                expect(command.recipeId).toBe('recipe-1');
                favoriteAdded = true;
                return true;
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        await request(app)
            .post('/api/accounts/ratings')
            .set('Authorization', 'Bearer current-access-token')
            .send({ recipeId: 'recipe-1', rating: 5 })
            .expect(200)
            .expect({ recipeId: 'recipe-1', rating: 5 });
        await request(app)
            .post('/api/accounts/ratings')
            .set('Authorization', 'Bearer current-access-token')
            .send({ recipeId: 'recipe-1', rating: 5.5 })
            .expect(400);
        await request(app)
            .post('/api/accounts/favorites')
            .set('Authorization', 'Bearer current-access-token')
            .send({ recipeId: 'recipe-1' })
            .expect(200)
            .expect({ added: true, recipeId: 'recipe-1' });
        expect(ratings).toEqual([5]);
        expect(favoriteAdded).toBe(true);
    });

    it('returns favorite recipe summaries', async () => {
        const repository = {
            async validateAccessToken() {
                return { accountId: 'account-1', sessionId: 'session-1', accessTokenHash: 'token-hash' };
            },
            async listFavorites() {
                return [{
                    id: 'recipe-1',
                    name: 'Soup',
                    minutes: 25,
                    ingredientNames: ['carrot', 'potato'],
                }];
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        await request(app)
            .get('/api/accounts/favorites')
            .set('Authorization', 'Bearer current-access-token')
            .expect(200)
            .expect({
                favorites: [{
                    id: 'recipe-1',
                    name: 'Soup',
                    minutes: 25,
                    ingredientNames: ['carrot', 'potato'],
                }],
            });
    });

    describe('account profile, privacy, and deletion', () => {
            function serviceFor(repository: AccountsRepository) {
                return new AccountsService({
                    repository,
                    passwordHasher: new TestPasswordHasher(),
                    mailer: new TestMailer(),
                    verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
                    now: () => 1_800_000_000_000,
                });
            }

            it('returns only the authenticated account email and username from the profile route', async () => {
                const repository = {
                    async validateAccessToken() {
                        return { accountId: 'account-1', sessionId: 'session-1', accessTokenHash: 'token-hash' };
                    },
                    async getProfile(accountId: string, sessionId: string, accessTokenHash: string, now: number) {
                        expect(accountId).toBe('account-1');
                        expect(sessionId).toBe('session-1');
                        expect(accessTokenHash).toBe('token-hash');
                        expect(now).toBe(1_800_000_000_000);
                        return { email: 'cook@example.test', username: 'home_cook' };
                    },
                    async assertReady() {},
                } as unknown as AccountsRepository;

                const response = await request(createApiApp(
                    new TestIngredientRepository(),
                    100,
                    undefined,
                    serviceFor(repository),
                ))
                    .get('/api/accounts/me')
                    .set('Authorization', 'Bearer current-access-token')
                    .expect(200);

                expect(response.body).toEqual({ email: 'cook@example.test', username: 'home_cook' });
                expect(JSON.stringify(response.body)).not.toMatch(/password|token|hash/iu);
            });

            it('requires explicit deletion confirmation and deletes through the authenticated session', async () => {
                let deletion: [string, string, string, number] | undefined;
                const repository = {
                    async validateAccessToken() {
                        return { accountId: 'account-1', sessionId: 'session-1', accessTokenHash: 'token-hash' };
                    },
                    async deleteAccount(accountId: string, sessionId: string, accessTokenHash: string, now: number) {
                        deletion = [accountId, sessionId, accessTokenHash, now];
                    },
                    async assertReady() {},
                } as unknown as AccountsRepository;
                const app = createApiApp(new TestIngredientRepository(), 100, undefined, serviceFor(repository));

                await request(app)
                    .delete('/api/accounts/me')
                    .set('Authorization', 'Bearer current-access-token')
                    .expect(400);
                expect(deletion).toBeUndefined();

                await request(app)
                    .delete('/api/accounts/me')
                    .set('Authorization', 'Bearer current-access-token')
                    .send({ confirm: true })
                    .expect(200)
                    .expect({ message: 'Account deleted.' });
                expect(deletion).toEqual(['account-1', 'session-1', 'token-hash', 1_800_000_000_000]);
            });

            it('uses the same accepted recovery response for known and unknown addresses', async () => {
                const repository = new TestAccountsRepository();
                const app = createApiApp(
                    new TestIngredientRepository(),
                    100,
                    undefined,
                    serviceFor(repository),
                );

                const known = await request(app)
                    .post('/api/accounts/recover')
                    .send({ email: 'known@example.test' })
                    .expect(202);
                repository.recoveryResult = 'not-found';
                const unknown = await request(app)
                    .post('/api/accounts/recover')
                    .send({ email: 'unknown@example.test' })
                    .expect(202);

                expect(known.body).toEqual(unknown.body);
                expect(known.body).toEqual({ message: 'If the account exists, a reset code will be sent.' });
            });

            it('rejects invalid Google identity without issuing a session', async () => {
                let sessionIssued = false;
                const repository = {
                    async getGoogleAccount() { return null; },
                    async issueSession() {
                        sessionIssued = true;
                        return { sessionId: 'session-1', accessToken: 'access', refreshToken: 'refresh' };
                    },
                    async assertReady() {},
                } as unknown as AccountsRepository;
                const service = new AccountsService({
                    repository,
                    passwordHasher: new TestPasswordHasher(),
                    mailer: new TestMailer(),
                    verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
                    googleVerifier: { async verify() { return null; } },
                });

                await request(createApiApp(new TestIngredientRepository(), 100, undefined, service))
                    .post('/api/accounts/google')
                    .send({ idToken: 'invalid-token', username: 'home_cook' })
                    .expect(401)
                    .expect({
                        error: {
                            code: 'GOOGLE_IDENTITY_INVALID',
                            message: 'The Google identity could not be verified.',
                        },
                    });
                expect(sessionIssued).toBe(false);
            });

            it('returns an explicit unavailable response when Google verification is down', async () => {
                const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
                const repository = {
                    async getGoogleAccount() { return null; },
                    async assertReady() {},
                } as unknown as AccountsRepository;
                const service = new AccountsService({
                    repository,
                    passwordHasher: new TestPasswordHasher(),
                    mailer: new TestMailer(),
                    verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
                    googleVerifier: {
                        async verify() {
                            throw new GoogleIdentityProviderError();
                        },
                    },
                });
                try {
                    await request(createApiApp(new TestIngredientRepository(), 100, undefined, service))
                        .post('/api/accounts/google')
                        .send({ idToken: 'signed-token' })
                        .expect(503)
                        .expect({
                            error: {
                                code: 'GOOGLE_SIGN_IN_UNAVAILABLE',
                                message: 'Google identity verification is temporarily unavailable.',
                            },
                        });
                } finally {
                    errorLog.mockRestore();
                }
            });

            it('requires authentication before reading private account data', async () => {
                let profileRead = false;
                const repository = {
                    async validateAccessToken() { return null; },
                    async getProfile() {
                        profileRead = true;
                        return { email: 'cook@example.test', username: 'home_cook' };
                    },
                    async assertReady() {},
                } as unknown as AccountsRepository;

                await request(createApiApp(
                    new TestIngredientRepository(),
                    100,
                    undefined,
                    serviceFor(repository),
                ))
                    .get('/api/accounts/me')
                    .set('Authorization', 'Bearer expired-token')
                    .expect(401);
                expect(profileRead).toBe(false);
            });
    });

    it('returns not-found for unknown favorite and rating targets', async () => {
        const repository = {
            async validateAccessToken() {
                return { accountId: 'account-1', sessionId: 'session-1' };
            },
            async addFavorite() {
                throw new RecipeNotFoundError();
            },
            async setRating() {
                throw new RecipeNotFoundError();
            },
            async assertReady() {},
        } as unknown as AccountsRepository;
        const service = new AccountsService({
            repository,
            passwordHasher: new TestPasswordHasher(),
            mailer: new TestMailer(),
            verificationSecret: 'a-secret-for-verification-tests-that-is-long-enough',
        });
        const app = createApiApp(new TestIngredientRepository(), 100, undefined, service);

        await request(app)
            .post('/api/accounts/favorites')
            .set('Authorization', 'Bearer current-access-token')
            .send({ recipeId: 'missing-recipe' })
            .expect(404)
            .expect({ error: { code: 'RECIPE_NOT_FOUND', message: 'The requested recipe was not found.' } });
        await request(app)
            .post('/api/accounts/ratings')
            .set('Authorization', 'Bearer current-access-token')
            .send({ recipeId: 'missing-recipe', rating: 5 })
            .expect(404)
            .expect({ error: { code: 'RECIPE_NOT_FOUND', message: 'The requested recipe was not found.' } });
    });
});
