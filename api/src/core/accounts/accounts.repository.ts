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

export type RegistrationResult = 'created' | 'duplicate' | 'rate-limited';
export type ResendResult = 'issued' | 'ineligible' | 'rate-limited';

export interface AccountsRepository {
    register(command: RegisterAccountCommand): Promise<RegistrationResult>;
    resendVerification(command: ResendVerificationCommand): Promise<ResendResult>;
    verify(command: VerifyAccountCommand): Promise<boolean>;
    assertReady(): Promise<void>;
}
