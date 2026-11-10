import { describe, expect, it, vi } from 'vitest';

const { createTransport } = vi.hoisted(() => ({
    createTransport: vi.fn(() => ({ sendMail: vi.fn() })),
}));

vi.mock('nodemailer', () => ({
    default: { createTransport },
}));

import {
    createVerificationMailer,
    emailEnvironmentSchema,
} from '../api/src/infrastructure/accounts/email-config.js';
import { ResendVerificationMailer } from '../api/src/infrastructure/accounts/resend-verification-mailer.js';
import { SmtpVerificationMailer } from '../api/src/infrastructure/accounts/smtp-verification-mailer.js';

describe('verification email provider configuration', () => {
    it('accepts local SMTP without any Resend configuration', () => {
        const environment = emailEnvironmentSchema.parse({
            EMAIL_PROVIDER: 'smtp',
            EMAIL_FROM: 'noreply@local.test',
            SMTP_HOST: 'mailpit',
            SMTP_PORT: '1025',
            RESEND_API_KEY: '',
        });

        expect(createVerificationMailer(environment)).toBeInstanceOf(SmtpVerificationMailer);
    });

    it('configures SMTP with the selected host and port', () => {
        const environment = emailEnvironmentSchema.parse({
            EMAIL_PROVIDER: 'smtp',
            EMAIL_FROM: 'noreply@local.test',
            SMTP_HOST: 'mailpit',
            SMTP_PORT: '1025',
        });

        createVerificationMailer(environment);

        expect(createTransport).toHaveBeenCalledWith({
            host: 'mailpit',
            port: 1025,
            secure: false,
        });
    });

    it('requires only Resend settings for the Resend provider', () => {
        const environment = emailEnvironmentSchema.parse({
            EMAIL_PROVIDER: 'resend',
            EMAIL_FROM: 'accounts@example.com',
            RESEND_API_KEY: 're_test',
            SMTP_HOST: '',
            SMTP_PORT: 'not-a-port',
        });

        expect(createVerificationMailer(environment)).toBeInstanceOf(ResendVerificationMailer);
    });

    it('rejects missing selected-provider configuration and mismatched SMTP credentials', () => {
        expect(
            emailEnvironmentSchema.safeParse({
                EMAIL_PROVIDER: 'smtp',
                EMAIL_FROM: 'noreply@local.test',
                SMTP_HOST: 'mailpit',
            }).success,
        ).toBe(false);
        expect(
            emailEnvironmentSchema.safeParse({
                EMAIL_PROVIDER: 'resend',
                EMAIL_FROM: 'accounts@example.com',
            }).success,
        ).toBe(false);
        expect(
            emailEnvironmentSchema.safeParse({
                EMAIL_PROVIDER: 'smtp',
                EMAIL_FROM: 'noreply@local.test',
                SMTP_HOST: 'mailpit',
                SMTP_PORT: 1025,
                SMTP_USER: 'user',
            }).success,
        ).toBe(false);
    });
});

describe('SMTP verification mailer', () => {
    it('sends verification messages through the configured transport', async () => {
        const sendMail = vi.fn().mockResolvedValue(undefined);
        const mailer = new SmtpVerificationMailer({ sendMail }, 'noreply@local.test');

        await mailer.sendVerificationEmail('cook@example.com', '01234567', 'challenge-id');

        expect(sendMail).toHaveBeenCalledWith({
            from: 'noreply@local.test',
            to: 'cook@example.com',
            subject: 'Verify your Recipe Graph account',
            text: 'Your verification code is 01234567. It expires in 24 hours.',
        });
    });
});
