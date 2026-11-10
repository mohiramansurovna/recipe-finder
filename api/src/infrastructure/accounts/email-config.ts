import nodemailer from 'nodemailer';
import { z } from 'zod';

import type { VerificationMailer } from '../../application/services/accounts.service.js';
import { ResendVerificationMailer } from './resend-verification-mailer.js';
import { SmtpVerificationMailer } from './smtp-verification-mailer.js';

export const emailEnvironmentSchema = z
    .discriminatedUnion('EMAIL_PROVIDER', [
        z.object({
            EMAIL_PROVIDER: z.literal('resend'),
            EMAIL_FROM: z.string().trim().email(),
            RESEND_API_KEY: z.string().trim().min(1),
        }),
        z.object({
            EMAIL_PROVIDER: z.literal('smtp'),
            EMAIL_FROM: z.string().trim().email(),
            SMTP_HOST: z.string().trim().min(1),
            SMTP_PORT: z.coerce.number().int().min(1).max(65535),
        }).strict(),
    ]);

export type EmailEnvironment = z.infer<typeof emailEnvironmentSchema>;

export function createVerificationMailer(environment: EmailEnvironment): VerificationMailer {
    if (environment.EMAIL_PROVIDER === 'resend') {
        return new ResendVerificationMailer(environment.RESEND_API_KEY, environment.EMAIL_FROM);
    }

    const transport = nodemailer.createTransport({
        host: environment.SMTP_HOST,
        port: environment.SMTP_PORT,
        secure: false,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
    });
    return new SmtpVerificationMailer(transport, environment.EMAIL_FROM);
}
