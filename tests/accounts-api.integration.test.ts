import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { AccountsService, hashSourceIp, hashVerificationCode } from '../api/src/application/services/accounts.service.js';
import type {
    AccountsRepository,
    RegisterAccountCommand,
    RegistrationResult,
    ResendResult,
    ResendVerificationCommand,
    VerifyAccountCommand,
} from '../api/src/core/accounts/accounts.repository.js';
import type { IngredientsRepository } from '../api/src/core/ingredients/ingredients.repository.js';
import { createApiApp } from '../api/src/app.js';
import type { PasswordHasher, VerificationMailer } from '../api/src/application/services/accounts.service.js';
import { Argon2PasswordHasher } from '../api/src/infrastructure/accounts/argon2-password-hasher.js';
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

    async assertReady(): Promise<void> {}
}

class TestMailer implements VerificationMailer {
    readonly deliveries: { email: string; code: string; idempotencyKey: string }[] = [];
    failure: Error | undefined;
    constructor(private readonly isCommitted: () => boolean = () => true) {}

    async sendVerificationEmail(email: string, code: string, idempotencyKey: string): Promise<void> {
        expect(this.isCommitted()).toBe(true);
        this.deliveries.push({ email, code, idempotencyKey });
        if (this.failure !== undefined) throw this.failure;
    }
}

class TestPasswordHasher implements PasswordHasher {
    async hash(password: string): Promise<string> {
        return `hash:${password.length}`;
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
            passwordHash: 'hash:15',
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
});
