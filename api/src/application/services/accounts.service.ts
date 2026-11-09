import { createHmac, randomInt, randomUUID } from 'node:crypto';

import type {
    AccountsRepository,
    RegistrationResult,
} from '../../core/accounts/accounts.repository.js';
import {
    InvalidVerificationCodeError,
    VerificationEmailDeliveryError,
} from '../../core/accounts/accounts.errors.js';

export interface PasswordHasher {
    hash(password: string): Promise<string>;
}

export interface VerificationMailer {
    sendVerificationEmail(email: string, code: string, idempotencyKey: string): Promise<void>;
}

export interface RegistrationInput {
    email: string;
    username: string;
    password: string;
}

export interface AccountServiceOptions {
    repository: AccountsRepository;
    passwordHasher: PasswordHasher;
    mailer: VerificationMailer;
    verificationSecret: string;
    now?: () => number;
    createCode?: () => string;
    onResendDeliveryFailure?: (challengeId: string) => void;
}

export function hashVerificationCode(secret: string, code: string): string {
    return createHmac('sha256', secret).update(`verification-code:${code}`).digest('hex');
}

export function hashSourceIp(secret: string, ip: string): string {
    return createHmac('sha256', secret).update(`source-ip:${ip}`).digest('hex');
}

function createVerificationCode(): string {
    return randomInt(0, 100_000_000).toString().padStart(8, '0');
}

export class AccountsService {
    private readonly now: () => number;
    private readonly createCode: () => string;

    constructor(private readonly options: AccountServiceOptions) {
        this.now = options.now ?? Date.now;
        this.createCode = options.createCode ?? createVerificationCode;
    }

    async register(input: RegistrationInput, sourceIp: string): Promise<RegistrationResult> {
        const now = this.now();
        const accountId = randomUUID();
        const challengeId = randomUUID();
        const code = this.createCode();
        const passwordHash = await this.options.passwordHasher.hash(input.password);
        const result = await this.options.repository.register({
            accountId,
            challengeId,
            email: input.email,
            username: input.username,
            passwordHash,
            codeHash: hashVerificationCode(this.options.verificationSecret, code),
            codeExpiresAt: now + 24 * 60 * 60 * 1000,
            now,
            accountRateKey: accountId,
            ipRateKey: hashSourceIp(this.options.verificationSecret, sourceIp),
        });

        if (result !== 'created') return result;
        try {
            await this.options.mailer.sendVerificationEmail(input.email, code, challengeId);
        } catch {
            throw new VerificationEmailDeliveryError();
        }
        return result;
    }

    async verify(email: string, code: string): Promise<void> {
        const verified = await this.options.repository.verify({
            email,
            codeHash: hashVerificationCode(this.options.verificationSecret, code),
            now: this.now(),
        });
        if (!verified) {
            throw new InvalidVerificationCodeError();
        }
    }

    async resendVerification(email: string, sourceIp: string): Promise<void> {
        const now = this.now();
        const challengeId = randomUUID();
        const code = this.createCode();
        const result = await this.options.repository.resendVerification({
            challengeId,
            email,
            codeHash: hashVerificationCode(this.options.verificationSecret, code),
            codeExpiresAt: now + 24 * 60 * 60 * 1000,
            now,
            ipRateKey: hashSourceIp(this.options.verificationSecret, sourceIp),
        });
        if (result !== 'issued') return;

        try {
            await this.options.mailer.sendVerificationEmail(email, code, challengeId);
        } catch {
            try {
                this.options.onResendDeliveryFailure?.(challengeId);
            } catch {
                // Keep delivery diagnostics from changing the non-enumerating response.
            }
        }
    }
}
