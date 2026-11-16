import { OAuth2Client } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';

import { GoogleIdentityProviderError } from '../api/src/core/accounts/accounts.errors.js';
import {
    createGoogleIdentityVerifier,
    GoogleIdentityVerifier,
} from '../api/src/infrastructure/accounts/google-verifier.js';

describe('Google identity verifier', () => {
    function clientFor(verifier: GoogleIdentityVerifier) {
        return (verifier as unknown as { client: OAuth2Client }).client;
    }

    it('validates against configured audiences and returns only verified identity claims', async () => {
        const verifier = new GoogleIdentityVerifier(['client-one', 'client-two', 'client-one']);
        const verifyIdToken = vi.spyOn(clientFor(verifier), 'verifyIdToken').mockResolvedValue({
            getPayload: () => ({
                sub: 'google-subject',
                email: 'cook@example.test',
                email_verified: true,
                hd: 'example.test',
            }),
        } as never);

        await expect(verifier.verify('opaque-google-id-token')).resolves.toEqual({
            sub: 'google-subject',
            email: 'cook@example.test',
            emailVerified: true,
            hostedDomain: 'example.test',
        });
        expect(verifyIdToken).toHaveBeenCalledWith({
            idToken: 'opaque-google-id-token',
            audience: ['client-one', 'client-two'],
        });
    });

    it('rejects invalid credentials without treating them as provider outages', async () => {
        const verifier = new GoogleIdentityVerifier(['client-one']);
        vi.spyOn(clientFor(verifier), 'verifyIdToken').mockRejectedValue(new Error('invalid token'));

        await expect(verifier.verify('invalid-token')).resolves.toBeNull();
    });

    it('maps transport failures to a safe provider-unavailable error', async () => {
        const verifier = new GoogleIdentityVerifier(['client-one']);
        vi.spyOn(clientFor(verifier), 'verifyIdToken').mockRejectedValue(
            Object.assign(new Error('transport failure'), { code: 'ECONNRESET' }),
        );

        await expect(verifier.verify('token')).rejects.toBeInstanceOf(GoogleIdentityProviderError);
    });

    it('parses comma-separated audience configuration and disables unconfigured sign-in', async () => {
        const configured = createGoogleIdentityVerifier({
            GOOGLE_CLIENT_ID: ' first ',
            GOOGLE_CLIENT_IDS: 'second, third',
        });
        expect(configured).toBeInstanceOf(GoogleIdentityVerifier);

        const unconfigured = createGoogleIdentityVerifier({});
        expect(unconfigured).toBeUndefined();
        await expect(new GoogleIdentityVerifier([]).verify('token')).resolves.toBeNull();
    });
});
