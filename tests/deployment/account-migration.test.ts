import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

describe('account migration deployment order', () => {
    it.each(['docker-compose.yml', 'docker-compose.demo.yml'])(
        'runs the graph-validated account migration between import and API in %s',
        (file) => {
            const compose = readFileSync(resolve(root, file), 'utf8');
            expect(compose.indexOf('  importer:')).toBeLessThan(compose.indexOf('  account-migration:'));
            expect(compose.indexOf('  account-migration:')).toBeLessThan(compose.indexOf('  api:'));
            const apiBlock = compose.slice(compose.indexOf('  api:'));
            expect(apiBlock).toContain('account-migration:');
            expect(apiBlock).toContain('condition: service_completed_successfully');
            expect(compose).toContain('RESEND_API_KEY');
            expect(compose).toContain('VERIFICATION_CODE_SECRET');
            expect(compose).toContain('EMAIL_FROM');
        },
    );

    it('uses graph import metadata rather than the Compose marker for schema migration', () => {
        const migration = readFileSync(resolve(root, 'api/src/infrastructure/neo4j/account-schema.ts'), 'utf8');
        expect(migration).toContain('RecipeGraphMetadata {key:');
        expect(migration).toContain('marker.completed');
        expect(migration).not.toContain('import-complete');
    });
});
