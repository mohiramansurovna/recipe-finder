import { Router, type NextFunction, type Request, type Response } from 'express';

import { AccountsService } from '../../../application/services/accounts.service.js';
import {
    InvalidVerificationCodeError,
    VerificationEmailDeliveryError,
} from '../../../core/accounts/accounts.errors.js';
import { ApiError, sendError } from '../api-error.js';
import {
    registerAccountSchema,
    resendVerificationSchema,
    verifyAccountSchema,
} from '../schemas/accounts.schemas.js';

function sourceIp(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
}

function reportPublicError(response: Response, error: unknown, next: NextFunction): void {
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

export function createAccountsRouter(accountsService: AccountsService): Router {
    const router = Router();

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

    return router;
}
