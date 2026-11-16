import type { VerificationMailer } from '../../application/services/accounts.service.js';

export class ResendVerificationMailer implements VerificationMailer {
    constructor(
        private readonly apiKey: string,
        private readonly from: string,
    ) {}

    async sendVerificationEmail(email: string, code: string, idempotencyKey: string): Promise<void> {
        await this.sendEmail(
            email,
            code,
            idempotencyKey,
            'Verify your Recipe Graph account',
            `Your verification code is ${code}. It expires in 24 hours.`,
        );
    }

    async sendRecoveryEmail(email: string, code: string, idempotencyKey: string): Promise<void> {
        await this.sendEmail(
            email,
            code,
            idempotencyKey,
            'Reset your Recipe Graph password',
            `Your password reset code is ${code}. It expires in 1 hour.`,
        );
    }

    private async sendEmail(
        email: string,
        code: string,
        idempotencyKey: string,
        subject: string,
        text: string,
    ): Promise<void> {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey,
            },
            signal: AbortSignal.timeout(10_000),
            body: JSON.stringify({
                from: this.from,
                to: [email],
                subject,
                text,
            }),
        });
        if (!response.ok) {
            throw new Error(`Resend returned HTTP ${response.status}.`);
        }
    }
}
