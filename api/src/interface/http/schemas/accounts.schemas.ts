import { z } from 'zod';

const emailSchema = z.string().trim().min(1).max(254).email().transform((email) => email.toLowerCase());
const usernameSchema = z
    .string()
    .regex(/^[A-Za-z0-9_]{3,30}$/u)
    .transform((username) => username.toLowerCase());

export const registerAccountSchema = z
    .object({
        email: emailSchema,
        username: usernameSchema,
        password: z.string().refine((password) => Array.from(password).length >= 12),
    })
    .strict();

export const verifyAccountSchema = z
    .object({
        email: emailSchema,
        code: z.string().regex(/^\d{8}$/u),
    })
    .strict();

export const resendVerificationSchema = z
    .object({ email: emailSchema })
    .strict();
