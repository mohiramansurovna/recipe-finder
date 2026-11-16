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

export const signInAccountSchema = z
    .object({
        email: emailSchema,
        password: z.string().min(1),
        deviceName: z.string().trim().max(120).optional(),
    })
    .strict();

export const googleSignInSchema = z
    .object({
        idToken: z.string().min(1),
        username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/u).optional(),
        deviceName: z.string().trim().max(120).optional(),
    })
    .strict();

export const recoverAccountSchema = z
    .object({ email: emailSchema })
    .strict();

export const resetPasswordSchema = z
    .object({
        email: emailSchema,
        code: z.string().regex(/^\d{8}$/u),
        password: z.string().refine((password) => Array.from(password).length >= 12),
    })
    .strict();

export const favoriteRecipeSchema = z
    .object({ recipeId: z.string().min(1) })
    .strict();

export const ratingSchema = z
    .object({
        recipeId: z.string().min(1),
        rating: z.number().int().min(1).max(5),
    })
    .strict();

export const deleteAccountSchema = z
    .object({ confirm: z.literal(true) })
    .strict();
