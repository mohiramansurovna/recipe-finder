import argon2 from 'argon2';

import type { PasswordHasher } from '../../application/services/accounts.service.js';

export class HashConcurrencyLimiter {
    private active = 0;
    private readonly waiting: (() => void)[] = [];

    constructor(private readonly limit = 4) {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new RangeError('Password hash concurrency must be a positive integer.');
        }
    }

    async run<T>(operation: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await operation();
        } finally {
            this.release();
        }
    }

    private async acquire(): Promise<void> {
        if (this.active < this.limit) {
            this.active += 1;
            return;
        }
        await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    private release(): void {
        const next = this.waiting.shift();
        if (next === undefined) {
            this.active -= 1;
        } else {
            next();
        }
    }
}

export class Argon2PasswordHasher implements PasswordHasher {
    private readonly limiter = new HashConcurrencyLimiter();

    hash(password: string): Promise<string> {
        return this.limiter.run(() =>
            argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 19_456,
                timeCost: 2,
                parallelism: 1,
            }),
        );
    }

    verify(passwordHash: string, password: string): Promise<boolean> {
        return this.limiter.run(() => argon2.verify(passwordHash, password));
    }
}
