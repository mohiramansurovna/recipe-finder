import { OAuth2Client } from 'google-auth-library';

import { GoogleIdentityProviderError } from '../../core/accounts/accounts.errors.js';
import type { GoogleAccountIdentity } from '../../core/accounts/accounts.repository.js';

export interface GoogleVerifierEnvironment {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_IDS?: string;
}

export class GoogleIdentityVerifier {
    private readonly client: OAuth2Client;
    private readonly allowedAudience: Set<string>;

    constructor(clientIds: Iterable<string>) {
        this.client = new OAuth2Client();
        const audience = [...new Set([...clientIds].map((item) => item.trim()).filter(Boolean))];
        this.allowedAudience = new Set(audience);
    }

    async verify(idToken: string): Promise<GoogleAccountIdentity | null> {
        if (this.allowedAudience.size === 0) return null;
        let ticket;
        try {
            ticket = await this.client.verifyIdToken({
                idToken,
                audience: [...this.allowedAudience],
            });
        } catch (error) {
            if (
                error !== null &&
                typeof error === 'object' &&
                (('response' in error) || ('code' in error && typeof error.code === 'string'))
            ) {
                throw new GoogleIdentityProviderError();
            }
            return null;
        }
        const payload = ticket.getPayload();
        if (payload == null || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
            return null;
        }
        return {
            sub: payload.sub,
            email: payload.email,
            emailVerified: payload.email_verified === true,
            hostedDomain: typeof payload.hd === 'string' ? payload.hd : undefined,
        };
    }
}

export function createGoogleIdentityVerifier(environment: GoogleVerifierEnvironment): GoogleIdentityVerifier | undefined {
    const clientIds = [
        environment.GOOGLE_CLIENT_ID,
        environment.GOOGLE_CLIENT_IDS,
    ]
        .flatMap((value) => typeof value === 'string' ? value.split(',') : [])
        .map((value) => value.trim())
        .filter(Boolean);

    return clientIds.length > 0 ? new GoogleIdentityVerifier(clientIds) : undefined;
}
