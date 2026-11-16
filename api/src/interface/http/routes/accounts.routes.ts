import { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';

import { AccountsService } from '../../../application/services/accounts.service.js';
import {
    AccountAlreadyExistsError,
    AccountMethodConflictError,
    GoogleIdentityProviderError,
    GoogleSignInUnavailableError,
    InvalidGoogleUsernameError,
    InvalidVerificationCodeError,
    RecipeNotFoundError,
    SessionExpiredError,
    VerificationEmailDeliveryError,
} from '../../../core/accounts/accounts.errors.js';
import { ApiError, sendError } from '../api-error.js';
import {
    favoriteRecipeSchema,
    googleSignInSchema,
    ratingSchema,
    deleteAccountSchema,
    recoverAccountSchema,
    registerAccountSchema,
    resendVerificationSchema,
    resetPasswordSchema,
    signInAccountSchema,
    verifyAccountSchema,
} from '../schemas/accounts.schemas.js';

function sourceIp(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
}

function reportPublicError(response: Response, error: unknown, next: NextFunction): void {
    if (error instanceof SessionExpiredError) {
        sendError(response, 401, 'SESSION_EXPIRED', error.message);
        return;
    }
    if (error instanceof AccountAlreadyExistsError) {
        sendError(response, 409, 'ACCOUNT_ALREADY_EXISTS', error.message);
        return;
    }
    if (error instanceof AccountMethodConflictError) {
        sendError(response, 409, 'ACCOUNT_METHOD_CONFLICT', error.message);
        return;
    }
    if (error instanceof RecipeNotFoundError) {
        sendError(response, 404, 'RECIPE_NOT_FOUND', error.message);
        return;
    }
    if (error instanceof InvalidGoogleUsernameError) {
        sendError(response, 400, 'INVALID_USERNAME', error.message);
        return;
    }
    if (error instanceof GoogleSignInUnavailableError || error instanceof GoogleIdentityProviderError) {
        next(new ApiError(503, 'GOOGLE_SIGN_IN_UNAVAILABLE', error.message, { cause: error }));
        return;
    }
    if (error instanceof InvalidVerificationCodeError) {
        sendError(
            response,
            400,
            'INVALID_VERIFICATION_CODE',
            'The verification code is invalid, expired, or no longer usable.',
        );
        return;
    }
    if (error instanceof VerificationEmailDeliveryError) {
        next(new ApiError(
            503,
            'EMAIL_DELIVERY_FAILED',
            'The account was created, but the verification email could not be sent. Please request another email later.',
            { cause: error },
        ));
        return;
    }
    if (error instanceof ApiError) {
        next(error);
        return;
    }
    next(error);
}

async function requireAuthenticatedAccount(
    request: Request,
    accountsService: AccountsService,
): Promise<{ accountId: string; sessionId: string; accessTokenHash: string }> {
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer +(.+)$/iu.exec(header) : null;
    if (match === null) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }
    const accessToken = match[1]?.trim() ?? '';
    if (accessToken.length === 0) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }
    const claim = await accountsService.authenticateAccessToken(accessToken);
    if (claim === null) {
        throw new ApiError(401, 'SESSION_EXPIRED', 'Your session is no longer active.');
    }
    return claim;
}

export function createAccountsRouter(accountsService: AccountsService): Router {
    const router = Router();
    const sensitiveAttemptLimit = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_request, response) => {
            sendError(response, 429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
        },
    });

    router.post('/accounts/register', async (request: Request, response: Response, next) => {
        const parsed = registerAccountSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(
                response,
                400,
                'INVALID_REQUEST',
                'Provide a valid email, a 3–30 character username, and a password of at least 12 characters.',
            );
            return;
        }

        try {
            const result = await accountsService.register(parsed.data, sourceIp(request));
            if (result === 'duplicate') {
                sendError(
                    response,
                    409,
                    'ACCOUNT_ALREADY_EXISTS',
                    'An account with that email or username already exists.',
                );
                return;
            }
            if (result === 'rate-limited') {
                sendError(response, 429, 'RATE_LIMITED', 'Too many verification emails were requested.');
                return;
            }
            response.status(201).json({ message: 'Check your email to verify your account.' });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/verify', async (request: Request, response: Response, next) => {
        const parsed = verifyAccountSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid email and eight-digit verification code.');
            return;
        }
        try {
            await accountsService.verify(parsed.data.email, parsed.data.code);
            response.json({ message: 'Email verified.' });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/resend-verification', async (request: Request, response: Response, next) => {
        const parsed = resendVerificationSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid email address.');
            return;
        }
        try {
            await accountsService.resendVerification(parsed.data.email, sourceIp(request));
            response.status(202).json({
                message: 'If the account is eligible, a verification email will be sent.',
            });
        } catch (error) {
            next(new ApiError(
                503,
                'VERIFICATION_UNAVAILABLE',
                'The verification request could not be processed.',
                { cause: error },
            ));
        }
    });

    router.post('/accounts/sign-in', sensitiveAttemptLimit, async (request: Request, response: Response, next) => {
        const parsed = signInAccountSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid email and password.');
            return;
        }

        try {
            const result = await accountsService.signIn({
                email: parsed.data.email,
                password: parsed.data.password,
                deviceName: parsed.data.deviceName,
            });
            if (result === null) {
                sendError(response, 401, 'INVALID_CREDENTIALS', 'The email or password is invalid.');
                return;
            }
            response.json({
                sessionId: result.sessionId,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/google', sensitiveAttemptLimit, async (request: Request, response: Response, next) => {
        const parsed = googleSignInSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid Google identity token.');
            return;
        }

        try {
            const result = await accountsService.googleSignIn({
                idToken: parsed.data.idToken,
                username: parsed.data.username,
                deviceName: parsed.data.deviceName,
            });
            if (result !== null && 'verificationRequired' in result) {
                response.status(202).json({
                    message: 'Check your email to verify your account before signing in.',
                });
                return;
            }
            if (result === null) {
                sendError(response, 401, 'GOOGLE_IDENTITY_INVALID', 'The Google identity could not be verified.');
                return;
            }
            response.json({
                sessionId: result.sessionId,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/recover', async (request: Request, response: Response, next) => {
        const parsed = recoverAccountSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid email address.');
            return;
        }

        try {
            await accountsService.requestRecovery(parsed.data.email, sourceIp(request));
            response.status(202).json({ message: 'If the account exists, a reset code will be sent.' });
        } catch (error) {
            next(error);
        }
    });

    router.post('/accounts/reset-password', sensitiveAttemptLimit, async (request: Request, response: Response, next) => {
        const parsed = resetPasswordSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid email, eight-digit code, and new password.');
            return;
        }

        try {
            await accountsService.resetPassword({
                email: parsed.data.email,
                code: parsed.data.code,
                password: parsed.data.password,
            });
            response.json({ message: 'Password reset complete.' });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.get('/accounts/sessions', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const sessions = await accountsService.listSessions(account.accountId, account.sessionId, account.accessTokenHash);
            response.json({
                sessions: sessions.map((session) => ({
                    ...session,
                    current: session.sessionId === account.sessionId,
                })),
            });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/sessions/refresh', async (request: Request, response: Response, next) => {
        const refreshToken = typeof request.body?.refreshToken === 'string' ? request.body.refreshToken : '';
        if (refreshToken.length === 0) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid refresh token.');
            return;
        }

        try {
            const userAgentHeader = request.headers['user-agent'];
            const deviceName = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader ?? undefined;
            const result = await accountsService.refreshSession(refreshToken, deviceName);
            if (result === null) {
                sendError(response, 401, 'SESSION_EXPIRED', 'The refresh token is invalid or expired.');
                return;
            }
            response.json({
                sessionId: result.sessionId,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/sign-out', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            await accountsService.signOut(account.accountId, account.sessionId, account.accessTokenHash);
            response.json({ message: 'Signed out.' });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.delete('/accounts/sessions/current', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            await accountsService.signOut(account.accountId, account.sessionId, account.accessTokenHash);
            response.json({ message: 'Current session ended.' });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.delete('/accounts/sessions/:sessionId', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const sessionId = Array.isArray(request.params.sessionId) ? request.params.sessionId[0] : request.params.sessionId;
            await accountsService.signOut(account.accountId, account.sessionId, account.accessTokenHash, sessionId);
            response.json({ sessionId, message: 'Session terminated.' });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.get('/accounts/favorites', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const favorites = await accountsService.listFavorites(account.accountId, account.sessionId, account.accessTokenHash);
            response.json({ favorites });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/favorites', async (request: Request, response: Response, next) => {
        const parsed = favoriteRecipeSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid recipe ID.');
            return;
        }
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const added = await accountsService.addFavorite(
                account.accountId,
                account.sessionId,
                account.accessTokenHash,
                parsed.data.recipeId,
            );
            response.json({ added, recipeId: parsed.data.recipeId });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.delete('/accounts/favorites/:recipeId', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const recipeId = Array.isArray(request.params.recipeId) ? request.params.recipeId[0] : request.params.recipeId;
            const removed = await accountsService.removeFavorite(
                account.accountId,
                account.sessionId,
                account.accessTokenHash,
                recipeId,
            );
            response.json({ removed, recipeId });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.get('/accounts/ratings/:recipeId', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const recipeId = Array.isArray(request.params.recipeId) ? request.params.recipeId[0] : request.params.recipeId;
            const rating = await accountsService.getMyRating(
                account.accountId,
                account.sessionId,
                account.accessTokenHash,
                recipeId,
            );
            response.json({ recipeId, rating });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.post('/accounts/ratings', async (request: Request, response: Response, next) => {
        const parsed = ratingSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a recipeId and an integer rating from 1 to 5.');
            return;
        }
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            await accountsService.setRating(
                account.accountId,
                account.sessionId,
                account.accessTokenHash,
                parsed.data.recipeId,
                parsed.data.rating,
            );
            response.json({ recipeId: parsed.data.recipeId, rating: parsed.data.rating });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.delete('/accounts/ratings/:recipeId', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const recipeId = Array.isArray(request.params.recipeId) ? request.params.recipeId[0] : request.params.recipeId;
            await accountsService.removeRating(
                account.accountId,
                account.sessionId,
                account.accessTokenHash,
                recipeId,
            );
            response.json({ recipeId, removed: true });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.get('/accounts/me', async (request: Request, response: Response, next) => {
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            const profile = await accountsService.getProfile(
                account.accountId,
                account.sessionId,
                account.accessTokenHash,
            );
            if (profile === null) {
                sendError(response, 401, 'SESSION_EXPIRED', 'Your session is no longer active.');
                return;
            }
            response.json(profile);
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    router.delete('/accounts/me', async (request: Request, response: Response, next) => {
        if (!deleteAccountSchema.safeParse(request.body).success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Confirm account deletion with { "confirm": true }.');
            return;
        }
        try {
            const account = await requireAuthenticatedAccount(request, accountsService);
            await accountsService.deleteAccount(account.accountId, account.sessionId, account.accessTokenHash);
            response.json({ message: 'Account deleted.' });
        } catch (error) {
            reportPublicError(response, error, next);
        }
    });

    return router;
}
