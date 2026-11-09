import 'dotenv/config';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import { z } from 'zod';

import { migrateAccountSchema } from '../api/src/infrastructure/neo4j/account-schema.js';

const configSchema = z.object({
    NEO4J_URI: z.string().min(1).default('bolt://localhost:7687'),
    NEO4J_USER: z.string().min(1).default('neo4j'),
    NEO4J_PASSWORD: z.string().min(1),
    NEO4J_DATABASE: z.string().min(1).default('neo4j'),
});

async function main(): Promise<void> {
    const config = configSchema.parse(process.env);
    const driver = neo4j.driver(
        config.NEO4J_URI,
        neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
    );
    try {
        await migrateAccountSchema(driver, config.NEO4J_DATABASE);
        console.log('Account schema migration completed.');
    } finally {
        await driver.close();
    }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown account migration failure.';
        console.error(`Account schema migration failed: ${message}`);
        process.exitCode = 1;
    });
}
