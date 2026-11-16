import type { RecipeSearchRecord } from '../recipes/recipes.types.js';

export interface RegisterAccountCommand {
    accountId: string;
    challengeId: string;
    email: string;
    username: string;
    passwordHash: string;
    codeHash: string;
    codeExpiresAt: number;
    now: number;
    accountRateKey: string;
    ipRateKey: string;
}

export interface ResendVerificationCommand {
    challengeId: string;
    email: string;
    codeHash: string;
    codeExpiresAt: number;
    now: number;
    ipRateKey: string;
}

export interface VerifyAccountCommand {
    email: string;
    codeHash: string;
    now: number;
}

export interface PasswordAccountRecord {
    accountId: string;
    passwordHash: string;
    emailVerified: boolean;
    authMethod: 'password' | 'google';
}

export interface AccountSessionClaim {
    accountId: string;
    sessionId: string;
    accessTokenHash: string;
}

export interface IssueSessionCommand {
    accountId: string;
    deviceName: string;
    accessToken: string;
    refreshToken: string;
    now: number;
    expectedPasswordHash?: string;
}

export interface SessionTokens {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
}

export interface SessionSummary {
    sessionId: string;
    deviceName: string;
    createdAt: number;
    lastUsedAt: number;
    expiresAt: number;
    current: boolean;
}

export interface AccountProfile {
    email: string;
    username: string;
}

export type FavoriteRecipe = RecipeSearchRecord;

export interface RecoveryChallengeCommand {
    email: string;
    challengeId: string;
    codeHash: string;
    codeExpiresAt: number;
    now: number;
    ipRateKey: string;
}

export interface ResetPasswordCommand {
    email: string;
    codeHash: string;
    newPasswordHash: string;
    now: number;
}

export interface GoogleAccountIdentity {
    sub: string;
    email: string;
    emailVerified: boolean;
    hostedDomain?: string;
}

export interface GoogleAccountRecord {
    accountId: string;
    email: string;
    username: string;
    emailVerified: boolean;
}

export interface GoogleAccountCommand {
    accountId: string;
    username: string;
    email: string;
    subject: string;
    emailVerified: boolean;
    now: number;
    challengeId?: string;
    codeHash?: string;
    codeExpiresAt?: number;
}

export interface FavoriteRecipeCommand {
    accountId: string;
    sessionId: string;
    accessTokenHash: string;
    now: number;
    recipeId: string;
}

export interface RatingCommand {
    accountId: string;
    sessionId: string;
    accessTokenHash: string;
    recipeId: string;
    value: number;
    now: number;
}

export type RegistrationResult = 'created' | 'duplicate' | 'rate-limited';
export type ResendResult = 'issued' | 'ineligible' | 'rate-limited';
export type RecoveryResult = 'issued' | 'not-found' | 'rate-limited';

export interface AccountsRepository {
    register(command: RegisterAccountCommand): Promise<RegistrationResult>;
    resendVerification(command: ResendVerificationCommand): Promise<ResendResult>;
    verify(command: VerifyAccountCommand): Promise<boolean>;
    getPasswordAccountForSignIn?(email: string): Promise<PasswordAccountRecord | null>;
    issueSession?(command: IssueSessionCommand): Promise<SessionTokens | null>;
    validateAccessToken?(accessToken: string, now: number): Promise<AccountSessionClaim | null>;
    getProfile?(accountId: string, sessionId: string, accessTokenHash: string, now: number): Promise<AccountProfile | null>;
    listSessions?(accountId: string, sessionId: string, accessTokenHash: string, now: number): Promise<SessionSummary[]>;
    refreshSession?(refreshToken: string, now: number): Promise<SessionTokens | null>;
    revokeSession?(
        accountId: string,
        currentSessionId: string,
        accessTokenHash: string,
        sessionId: string,
        now: number,
    ): Promise<void>;
    requestRecovery?(command: RecoveryChallengeCommand): Promise<RecoveryResult>;
    resetPassword?(command: ResetPasswordCommand): Promise<boolean>;
    getGoogleAccount?(subject: string): Promise<GoogleAccountRecord | null>;
    createGoogleAccount?(command: GoogleAccountCommand): Promise<GoogleAccountRecord>;
    addFavorite?(command: FavoriteRecipeCommand): Promise<boolean>;
    removeFavorite?(command: FavoriteRecipeCommand): Promise<boolean>;
    listFavorites?(accountId: string, sessionId: string, accessTokenHash: string, now: number): Promise<FavoriteRecipe[]>;
    setRating?(command: RatingCommand): Promise<void>;
    removeRating?(command: RatingCommand): Promise<void>;
    getRating?(command: RatingCommand): Promise<number | null>;
    deleteAccount?(accountId: string, sessionId: string, accessTokenHash: string, now: number): Promise<void>;
    assertReady(): Promise<void>;
}
