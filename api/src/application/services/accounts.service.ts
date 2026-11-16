import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';

import type {
    AccountSessionClaim,
    AccountProfile,
    AccountsRepository,
    FavoriteRecipe,
    GoogleAccountIdentity,
    GoogleAccountRecord,
    IssueSessionCommand,
    RegistrationResult,
    SessionSummary,
    SessionTokens,
} from '../../core/accounts/accounts.repository.js';
import {
    AccountAlreadyExistsError,
    AccountMethodConflictError,
    GoogleAccountCreationConflictError,
    GoogleIdentityProviderError,
    GoogleSignInUnavailableError,
    InvalidGoogleUsernameError,
    InvalidVerificationCodeError,
    VerificationEmailDeliveryError,
} from '../../core/accounts/accounts.errors.js';

export interface PasswordHasher {
    hash(password: string): Promise<string>;
    verify?(passwordHash: string, password: string): Promise<boolean>;
}

export interface VerificationMailer {
    sendVerificationEmail(email: string, code: string, idempotencyKey: string): Promise<void>;
    sendRecoveryEmail?(email: string, code: string, idempotencyKey: string): Promise<void>;
}

export interface GoogleIdentityVerifier {
    verify(idToken: string): Promise<GoogleAccountIdentity | null>;
}

export interface RegistrationInput {
    email: string;
    username: string;
    password: string;
}

export interface SignInInput {
    email: string;
    password: string;
    deviceName?: string;
}

export interface GoogleSignInInput {
    idToken: string;
    username?: string;
    deviceName?: string;
}

export type GoogleSignInResult =
    | SessionTokens
    | { verificationRequired: true; email: string }
    | null;

export interface PasswordResetInput {
    email: string;
    code: string;
    password: string;
}

export interface AccountServiceOptions {
    repository: AccountsRepository;
    passwordHasher: PasswordHasher;
    mailer: VerificationMailer;
    verificationSecret: string;
    googleVerifier?: GoogleIdentityVerifier;
    now?: () => number;
    createCode?: () => string;
    onResendDeliveryFailure?: (challengeId: string, error: unknown) => void;
    onRecoveryDeliveryFailure?: (challengeId: string, error: unknown) => void;
}

export function hashVerificationCode(secret: string, email: string, code: string): string {
    return hashOneTimeCode(secret, 'verification-code', email, code);
}

export function hashRecoveryCode(secret: string, email: string, code: string): string {
    return hashOneTimeCode(secret, 'password-recovery', email, code);
}

function hashOneTimeCode(secret: string, purpose: string, email: string, code: string): string {
    return createHmac('sha256', secret)
        .update(JSON.stringify([purpose, email.toLowerCase(), code]))
        .digest('hex');
}

export function hashSourceIp(secret: string, ip: string): string {
    return createHmac('sha256', secret).update(`source-ip:${ip}`).digest('hex');
}

function createVerificationCode(): string {
    return randomInt(0, 100_000_000).toString().padStart(8, '0');
}

function createOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
}

function isAuthoritativeGoogleEmail(email: string, hostedDomain?: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    const domain = normalizedEmail.split('@', 2)[1] ?? '';
    if (domain === 'gmail.com') return true;
    if (hostedDomain !== undefined && hostedDomain.trim().length > 0) {
        return domain === hostedDomain.trim().toLowerCase();
    }
    return false;
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
            email: normalizeEmail(input.email),
            username: normalizeUsername(input.username),
            passwordHash,
            codeHash: hashVerificationCode(this.options.verificationSecret, normalizeEmail(input.email), code),
            codeExpiresAt: now + 24 * 60 * 60 * 1000,
            now,
            accountRateKey: accountId,
            ipRateKey: hashSourceIp(this.options.verificationSecret, sourceIp),
        });

        if (result !== 'created') return result;
        try {
            await this.options.mailer.sendVerificationEmail(normalizeEmail(input.email), code, challengeId);
        } catch (error) {
            throw new VerificationEmailDeliveryError({ cause: error });
        }
        return result;
    }

    async verify(email: string, code: string): Promise<void> {
        const verified = await this.options.repository.verify({
            email: normalizeEmail(email),
            codeHash: hashVerificationCode(this.options.verificationSecret, normalizeEmail(email), code),
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
            email: normalizeEmail(email),
            codeHash: hashVerificationCode(this.options.verificationSecret, normalizeEmail(email), code),
            codeExpiresAt: now + 24 * 60 * 60 * 1000,
            now,
            ipRateKey: hashSourceIp(this.options.verificationSecret, sourceIp),
        });
        if (result !== 'issued') return;

        try {
            await this.options.mailer.sendVerificationEmail(normalizeEmail(email), code, challengeId);
        } catch (error) {
            try {
                this.options.onResendDeliveryFailure?.(challengeId, error);
            } catch {
                // Keep delivery diagnostics from changing the non-enumerating response.
            }
        }
    }

    async authenticateAccessToken(accessToken: string): Promise<AccountSessionClaim | null> {
        if (this.options.repository.validateAccessToken === undefined) {
            throw new Error('Account repository does not support session authentication.');
        }
        return this.options.repository.validateAccessToken(accessToken, this.now());
    }

    async signIn(input: SignInInput): Promise<SessionTokens | null> {
        const repo = this.options.repository;
        if (repo.getPasswordAccountForSignIn === undefined || repo.issueSession === undefined) {
            throw new Error('Account repository does not support password sign-in.');
        }
        const email = normalizeEmail(input.email);
        const account = await repo.getPasswordAccountForSignIn(email);
        if (account === null) return null;
        if (account.authMethod === 'google') {
            throw new AccountMethodConflictError('google');
        }
        if (!account.emailVerified) return null;
        if (this.options.passwordHasher.verify === undefined) {
            throw new Error('Configured password hasher does not support password verification.');
        }
        const passwordValid = await this.options.passwordHasher.verify(account.passwordHash, input.password);
        if (!passwordValid) return null;

        const command: IssueSessionCommand = {
            accountId: account.accountId,
            deviceName: (input.deviceName ?? 'Unknown device').trim() || 'Unknown device',
            accessToken: createOpaqueToken(),
            refreshToken: createOpaqueToken(),
            now: this.now(),
            expectedPasswordHash: account.passwordHash,
        };
        return repo.issueSession(command);
    }

    async refreshSession(refreshToken: string, _deviceName?: string): Promise<SessionTokens | null> {
        void _deviceName;
        const repo = this.options.repository;
        if (repo.refreshSession === undefined) {
            throw new Error('Account repository does not support session refresh.');
        }
        const session = await repo.refreshSession(refreshToken, this.now());
        if (session === null) return null;
        return session;
    }

    async getProfile(accountId: string, sessionId: string, accessTokenHash: string): Promise<AccountProfile | null> {
        const repo = this.options.repository;
        if (repo.getProfile === undefined) {
            throw new Error('Account repository does not support profile reads.');
        }
        return repo.getProfile(accountId, sessionId, accessTokenHash, this.now());
    }

    async listSessions(accountId: string, sessionId: string, accessTokenHash: string): Promise<SessionSummary[]> {
        const repo = this.options.repository;
        if (repo.listSessions === undefined) {
            throw new Error('Account repository does not support session listing.');
        }
        return repo.listSessions(accountId, sessionId, accessTokenHash, this.now());
    }

    async signOut(
        accountId: string,
        currentSessionId: string,
        accessTokenHash: string,
        sessionId = currentSessionId,
    ): Promise<void> {
        const repo = this.options.repository;
        if (repo.revokeSession === undefined) {
            throw new Error('Account repository does not support session revocation.');
        }
        await repo.revokeSession(accountId, currentSessionId, accessTokenHash, sessionId, this.now());
    }

    async requestRecovery(email: string, sourceIp: string): Promise<void> {
        const repo = this.options.repository;
        if (repo.requestRecovery === undefined) {
            throw new Error('Account repository does not support password recovery.');
        }
        const normalizedEmail = normalizeEmail(email);
        const now = this.now();
        const challengeId = randomUUID();
        const code = this.createCode();
        const result = await repo.requestRecovery({
            email: normalizedEmail,
            challengeId,
            codeHash: hashRecoveryCode(this.options.verificationSecret, normalizedEmail, code),
            codeExpiresAt: now + 60 * 60 * 1000,
            now,
            ipRateKey: hashSourceIp(this.options.verificationSecret, sourceIp),
        });
        if (result === 'issued') void this.deliverRecoveryEmail(normalizedEmail, code, challengeId);
    }

    async resetPassword(input: PasswordResetInput): Promise<void> {
        const repo = this.options.repository;
        if (repo.resetPassword === undefined) {
            throw new Error('Account repository does not support password reset.');
        }
        const normalizedEmail = normalizeEmail(input.email);
        const normalPassword = input.password;
        const newPasswordHash = await this.options.passwordHasher.hash(normalPassword);
        const isValid = await repo.resetPassword({
            email: normalizedEmail,
            codeHash: hashRecoveryCode(this.options.verificationSecret, normalizedEmail, input.code),
            newPasswordHash,
            now: this.now(),
        });
        if (!isValid) {
            throw new InvalidVerificationCodeError();
        }
    }

    async googleSignIn(input: GoogleSignInInput): Promise<GoogleSignInResult> {
        const repo = this.options.repository;
        const verifier = this.options.googleVerifier;
        if (verifier === undefined || repo.getGoogleAccount === undefined) {
            throw new GoogleSignInUnavailableError();
        }
        let payload: GoogleAccountIdentity | null;
        try {
            payload = await verifier.verify(input.idToken);
        } catch (error) {
            if (error instanceof GoogleIdentityProviderError) throw error;
            throw new GoogleIdentityProviderError();
        }
        if (payload === null) return null;

        const email = normalizeEmail(payload.email);
        let account: GoogleAccountRecord | null = await repo.getGoogleAccount(payload.sub);
        const authoritativeEmail = payload.emailVerified && isAuthoritativeGoogleEmail(email, payload.hostedDomain);
        if (account === null) {
            if (repo.getPasswordAccountForSignIn !== undefined) {
                const accountByEmail = await repo.getPasswordAccountForSignIn(email);
                if (accountByEmail !== null) {
                    throw new AccountMethodConflictError(accountByEmail.authMethod);
                }
            }
            if (repo.createGoogleAccount === undefined) {
                throw new Error('Account repository does not support Google account creation.');
            }
            const username = normalizeUsername(input.username ?? '');
            if (!/^[A-Za-z0-9_]{3,30}$/u.test(username)) throw new InvalidGoogleUsernameError();
            const challengeId = authoritativeEmail ? undefined : randomUUID();
            const code = challengeId === undefined ? undefined : this.createCode();
            let accountCreated = false;
            try {
                account = await repo.createGoogleAccount({
                    accountId: randomUUID(),
                    username,
                    email,
                    subject: payload.sub,
                    emailVerified: authoritativeEmail,
                    now: this.now(),
                    challengeId,
                    codeHash: code === undefined ? undefined : hashVerificationCode(this.options.verificationSecret, email, code),
                    codeExpiresAt: code === undefined ? undefined : this.now() + 24 * 60 * 60 * 1000,
                });
                accountCreated = true;
            } catch (error) {
                if (!(error instanceof AccountAlreadyExistsError) && !(error instanceof GoogleAccountCreationConflictError)) {
                    throw error;
                }
                const concurrentlyCreated = await repo.getGoogleAccount(payload.sub);
                if (concurrentlyCreated === null) {
                    if (error instanceof AccountAlreadyExistsError) {
                        const accountByEmail = await repo.getPasswordAccountForSignIn?.(email);
                        if (accountByEmail !== null && accountByEmail !== undefined) {
                            throw new AccountMethodConflictError(accountByEmail.authMethod);
                        }
                        throw error;
                    }
                    throw error;
                }
                account = concurrentlyCreated;
            }
            if (accountCreated && code !== undefined && challengeId !== undefined) {
                try {
                    await this.options.mailer.sendVerificationEmail(email, code, challengeId);
                } catch (error) {
                    throw new VerificationEmailDeliveryError({ cause: error });
                }
            }
        }

        if (!account.emailVerified) {
            return { verificationRequired: true, email: account.email };
        }

        if (repo.issueSession === undefined) {
            throw new Error('Account repository does not support session creation.');
        }
        return repo.issueSession({
            accountId: account.accountId,
            deviceName: (input.deviceName ?? 'Google device').trim() || 'Google device',
            accessToken: createOpaqueToken(),
            refreshToken: createOpaqueToken(),
            now: this.now(),
        });
    }

    async listFavorites(accountId: string, sessionId: string, accessTokenHash: string): Promise<FavoriteRecipe[]> {
        const repo = this.options.repository;
        if (repo.listFavorites === undefined) {
            throw new Error('Account repository does not support favorite listing.');
        }
        return repo.listFavorites(accountId, sessionId, accessTokenHash, this.now());
    }

    async addFavorite(accountId: string, sessionId: string, accessTokenHash: string, recipeId: string): Promise<boolean> {
        const repo = this.options.repository;
        if (repo.addFavorite === undefined) {
            throw new Error('Account repository does not support favorites.');
        }
        return repo.addFavorite({ accountId, sessionId, accessTokenHash, recipeId, now: this.now() });
    }

    async removeFavorite(accountId: string, sessionId: string, accessTokenHash: string, recipeId: string): Promise<boolean> {
        const repo = this.options.repository;
        if (repo.removeFavorite === undefined) {
            throw new Error('Account repository does not support favorites.');
        }
        return repo.removeFavorite({ accountId, sessionId, accessTokenHash, recipeId, now: this.now() });
    }

    async setRating(
        accountId: string,
        sessionId: string,
        accessTokenHash: string,
        recipeId: string,
        value: number,
    ): Promise<void> {
        if (!Number.isInteger(value) || value < 1 || value > 5) {
            throw new Error('Rating must be an integer from 1 to 5.');
        }
        const repo = this.options.repository;
        if (repo.setRating === undefined) {
            throw new Error('Account repository does not support ratings.');
        }
        await repo.setRating({ accountId, sessionId, accessTokenHash, recipeId, value, now: this.now() });
    }

    async removeRating(accountId: string, sessionId: string, accessTokenHash: string, recipeId: string): Promise<void> {
        const repo = this.options.repository;
        if (repo.removeRating === undefined) {
            throw new Error('Account repository does not support ratings.');
        }
        await repo.removeRating({ accountId, sessionId, accessTokenHash, recipeId, value: 0, now: this.now() });
    }

    async getMyRating(
        accountId: string,
        sessionId: string,
        accessTokenHash: string,
        recipeId: string,
    ): Promise<number | null> {
        const repo = this.options.repository;
        if (repo.getRating === undefined) {
            throw new Error('Account repository does not support rating reads.');
        }
        return repo.getRating({ accountId, sessionId, accessTokenHash, recipeId, value: 0, now: this.now() });
    }

    async deleteAccount(accountId: string, sessionId: string, accessTokenHash: string): Promise<void> {
        const repo = this.options.repository;
        if (repo.deleteAccount === undefined) {
            throw new Error('Account repository does not support account deletion.');
        }
        await repo.deleteAccount(accountId, sessionId, accessTokenHash, this.now());
    }

    private async deliverRecoveryEmail(email: string, code: string, challengeId: string): Promise<void> {
        try {
            if (this.options.mailer.sendRecoveryEmail === undefined) {
                throw new Error('Configured mailer does not support password recovery email.');
            }
            await this.options.mailer.sendRecoveryEmail(email, code, challengeId);
        } catch (error) {
            if (this.options.onRecoveryDeliveryFailure === undefined) {
                console.error('Password recovery email delivery failed.', {
                    challengeId,
                    reason: error instanceof Error ? error.message : 'Unknown delivery error',
                });
                return;
            }
            try {
                this.options.onRecoveryDeliveryFailure(challengeId, error);
            } catch {
                console.error('Password recovery email failure could not be reported.', { challengeId });
            }
        }
    }
}
