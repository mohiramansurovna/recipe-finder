export class InvalidVerificationCodeError extends Error {}

export class SessionExpiredError extends Error {
    constructor() {
        super('The current session is no longer active.');
        this.name = 'SessionExpiredError';
    }
}

export class VerificationEmailDeliveryError extends Error {
    constructor(options?: ErrorOptions) {
        super('Verification email delivery failed.', options);
    }
}

export class AccountMethodConflictError extends Error {
    constructor(method: 'password' | 'google') {
        super(`This email is already registered with a ${method} account.`);
        this.name = 'AccountMethodConflictError';
    }
}

export class AccountAlreadyExistsError extends Error {
    constructor() {
        super('An account with that email or username already exists.');
        this.name = 'AccountAlreadyExistsError';
    }
}

export class GoogleAccountCreationConflictError extends Error {
    constructor() {
        super('The Google account was created by a concurrent request.');
        this.name = 'GoogleAccountCreationConflictError';
    }
}

export class GoogleSignInUnavailableError extends Error {
    constructor() {
        super('Google sign-in is unavailable.');
        this.name = 'GoogleSignInUnavailableError';
    }
}

export class GoogleIdentityProviderError extends Error {
    constructor() {
        super('Google identity verification is temporarily unavailable.');
        this.name = 'GoogleIdentityProviderError';
    }
}

export class InvalidGoogleUsernameError extends Error {
    constructor() {
        super('Choose a username with 3 to 30 letters, numbers, or underscores.');
        this.name = 'InvalidGoogleUsernameError';
    }
}

export class RecipeNotFoundError extends Error {
    constructor() {
        super('The requested recipe was not found.');
        this.name = 'RecipeNotFoundError';
    }
}
