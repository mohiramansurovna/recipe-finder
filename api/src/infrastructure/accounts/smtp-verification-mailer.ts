import type { VerificationMailer } from '../../application/services/accounts.service.js';

export interface VerificationEmailTransport {
    sendMail(message: {
        from: string;
        to: string;
        subject: string;
        text: string;
    }): Promise<unknown>;
}

export class SmtpVerificationMailer implements VerificationMailer {
    constructor(
        private readonly transport: VerificationEmailTransport,
        private readonly from: string,
    ) {}

    async sendVerificationEmail(email: string, code: string, idempotencyKey: string): Promise<void> {
        void idempotencyKey;
        await this.transport.sendMail({
            from: this.from,
            to: email,
            subject: 'Verify your Recipe Graph account',
            text: `Your verification code is ${code}. It expires in 24 hours.`,
        });
    }
}
