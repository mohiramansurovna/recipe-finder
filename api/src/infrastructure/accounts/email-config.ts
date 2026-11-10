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
            SMTP_USER: z.string().optional(),
            SMTP_PASSWORD: z.string().optional(),
        }),
    ])
    .superRefine((environment, context) => {
        if (environment.EMAIL_PROVIDER === 'smtp') {
            if (Boolean(environment.SMTP_USER) !== Boolean(environment.SMTP_PASSWORD)) {
                context.addIssue({
                    code: 'custom',
                    path: ['SMTP_PASSWORD'],
                    message: 'SMTP_USER and SMTP_PASSWORD must be configured together.',
                });
            }
        }
    });

export type EmailEnvironment = z.infer<typeof emailEnvironmentSchema>;

export function createVerificationMailer(environment: EmailEnvironment): VerificationMailer {
    if (environment.EMAIL_PROVIDER === 'resend') {
        return new ResendVerificationMailer(environment.RESEND_API_KEY, environment.EMAIL_FROM);
    }

    const transport = nodemailer.createTransport({
        host: environment.SMTP_HOST,
        port: environment.SMTP_PORT,
        secure: false,
        ...(environment.SMTP_USER && environment.SMTP_PASSWORD
            ? { auth: { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD } }
            : {}),
    });
    return new SmtpVerificationMailer(transport, environment.EMAIL_FROM);
}
