export class InvalidVerificationCodeError extends Error {}

export class VerificationEmailDeliveryError extends Error {
    constructor(options?: ErrorOptions) {
        super('Verification email delivery failed.', options);
    }
}
