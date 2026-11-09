import type { Driver, Record as Neo4jRecord } from 'neo4j-driver';
import { describe, expect, it, vi } from 'vitest';

import {
    assertAccountSchemaReady,
    migrateAccountSchema,
} from '../api/src/infrastructure/neo4j/account-schema.js';

type Constraint = { label: string; property: string };

function record(values: Record<string, unknown>): Neo4jRecord {
    return { get: (key: string) => values[key] } as unknown as Neo4jRecord;
}

function makeDriver(options: { imported?: boolean; recipeConstraint?: boolean } = {}) {
    const constraints: Constraint[] = options.recipeConstraint === false
        ? [
            { label: 'Ingredient', property: 'name' },
            { label: 'IngredientCategory', property: 'name' },
            { label: 'Cuisine', property: 'name' },
        ]
        : [
            { label: 'Recipe', property: 'id' },
            { label: 'Ingredient', property: 'name' },
            { label: 'IngredientCategory', property: 'name' },
            { label: 'Cuisine', property: 'name' },
        ];
    const queries: string[] = [];
    const session = {
        run: vi.fn(async (query: string) => {
            queries.push(query);
            if (query.startsWith('SHOW CONSTRAINTS')) {
                return {
                    records: constraints.map(({ label, property }) =>
                        record({
                            type: 'UNIQUENESS',
                            entityType: 'NODE',
                            labelsOrTypes: [label],
                            properties: [property],
                        }),
                    ),
                };
            }
            if (query.includes('RecipeGraphMetadata')) {
                const imported = options.imported !== false;
                return {
                    records: [
                        record({
                            markerCount: imported ? 1 : 0,
                            completionValues: imported ? [true] : [],
                            recipeCount: imported ? 3 : 0,
                            ingredientCount: imported ? 4 : 0,
                            useCount: imported ? 5 : 0,
                        }),
                    ],
                };
            }
            const labelMatch = query.match(/FOR \(node:([A-Za-z]+)\) REQUIRE node\.([A-Za-z]+) IS UNIQUE/u);
            if (labelMatch?.[1] !== undefined && labelMatch[2] !== undefined) {
                const constraint = { label: labelMatch[1], property: labelMatch[2] };
                if (!constraints.some((item) => item.label === constraint.label && item.property === constraint.property)) {
                    constraints.push(constraint);
                }
            }
            return { records: [] };
        }),
        close: vi.fn(async () => undefined),
    };
    const driver = {
        session: vi.fn(() => session),
        verifyConnectivity: vi.fn(async () => undefined),
    } as unknown as Driver;
    return { driver, queries, session };
}

describe('account schema migration and readiness', () => {
    it('rejects graphs without the authoritative import-completion state', async () => {
        const { driver } = makeDriver({ imported: false });
        await expect(migrateAccountSchema(driver, 'neo4j')).rejects.toThrow(
            'Recipe import is incomplete',
        );
    });

    it('rejects missing recipe constraints before adding account constraints', async () => {
        const { driver, queries } = makeDriver({ recipeConstraint: false });
        await expect(migrateAccountSchema(driver, 'neo4j')).rejects.toThrow(
            'Required recipe constraint is missing',
        );
        expect(queries.some((query) => query.startsWith('CREATE CONSTRAINT account_'))).toBe(false);
    });

    it('creates account uniqueness constraints idempotently and validates readiness', async () => {
        const { driver, queries } = makeDriver();
        await migrateAccountSchema(driver, 'neo4j');
        await migrateAccountSchema(driver, 'neo4j');
        await expect(assertAccountSchemaReady(driver, 'neo4j')).resolves.toBeUndefined();
        expect(queries.filter((query) => query.startsWith('CREATE CONSTRAINT'))).toHaveLength(10);
        expect(driver.verifyConnectivity).toHaveBeenCalledOnce();
    });

    it('does not report readiness when the graph is unavailable', async () => {
        const { driver } = makeDriver();
        vi.mocked(driver.verifyConnectivity).mockRejectedValue(new Error('unavailable'));
        await expect(assertAccountSchemaReady(driver, 'neo4j')).rejects.toThrow('unavailable');
    });
});
