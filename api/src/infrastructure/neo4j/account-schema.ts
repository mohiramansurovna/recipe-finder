import type { Driver, Record as Neo4jRecord } from 'neo4j-driver';

import { withSession } from './neo4j-sessions.js';

const RECIPE_CONSTRAINTS = [
    { label: 'Recipe', property: 'id' },
    { label: 'Ingredient', property: 'name' },
    { label: 'IngredientCategory', property: 'name' },
    { label: 'Cuisine', property: 'name' },
] as const;

const ACCOUNT_CONSTRAINTS = [
    { label: 'Account', property: 'id', name: 'account_id_unique' },
    { label: 'Account', property: 'emailNormalized', name: 'account_email_unique' },
    { label: 'Account', property: 'usernameNormalized', name: 'account_username_unique' },
    { label: 'VerificationChallenge', property: 'id', name: 'verification_challenge_id_unique' },
    { label: 'AccountRateLimit', property: 'key', name: 'account_rate_limit_key_unique' },
] as const;

function integer(record: Neo4jRecord, key: string): number {
    const value: unknown = record.get(key);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (value !== null && typeof value === 'object' && 'toNumber' in value) {
        const number = (value as { toNumber(): number }).toNumber();
        if (Number.isSafeInteger(number)) return number;
    }
    throw new Error(`Neo4j returned an invalid ${key} value.`);
}

function isConstraintPresent(
    record: Neo4jRecord,
    label: string,
    property: string,
): boolean {
    const labels: unknown = record.get('labelsOrTypes');
    const properties: unknown = record.get('properties');
    const type: unknown = record.get('type');
    const entityType: unknown = record.get('entityType');
    return (
        type === 'UNIQUENESS' &&
        entityType === 'NODE' &&
        Array.isArray(labels) &&
        labels.includes(label) &&
        Array.isArray(properties) &&
        properties.length === 1 &&
        properties[0] === property
    );
}

async function showConstraints(session: import('neo4j-driver').Session): Promise<Neo4jRecord[]> {
    const result = await session.run(
        'SHOW CONSTRAINTS YIELD type, entityType, labelsOrTypes, properties RETURN type, entityType, labelsOrTypes, properties',
    );
    return result.records;
}

async function verifyRecipeGraph(session: import('neo4j-driver').Session): Promise<void> {
    const result = await session.run(
        `OPTIONAL MATCH (marker:RecipeGraphMetadata {key: 'recipe-import'})
         WITH count(marker) AS markerCount, collect(marker.completed) AS completionValues
         OPTIONAL MATCH (recipe:Recipe)
         WITH markerCount, completionValues, count(recipe) AS recipeCount
         OPTIONAL MATCH (ingredient:Ingredient)
         WITH markerCount, completionValues, recipeCount, count(ingredient) AS ingredientCount
         OPTIONAL MATCH (:Recipe)-[use:USES]->(:Ingredient)
         RETURN markerCount, completionValues, recipeCount, ingredientCount, count(use) AS useCount`,
    );
    const record = result.records[0];
    if (record === undefined) throw new Error('Neo4j did not return recipe graph readiness state.');
    const completionValues: unknown = record.get('completionValues');
    if (
        integer(record, 'markerCount') !== 1 ||
        !Array.isArray(completionValues) ||
        completionValues.length !== 1 ||
        completionValues[0] !== true ||
        integer(record, 'recipeCount') < 1 ||
        integer(record, 'ingredientCount') < 1 ||
        integer(record, 'useCount') < 1
    ) {
        throw new Error('Recipe import is incomplete or required recipe data is missing.');
    }

    const constraints = await showConstraints(session);
    for (const required of RECIPE_CONSTRAINTS) {
        if (!constraints.some((constraint) => isConstraintPresent(constraint, required.label, required.property))) {
            throw new Error(`Required recipe constraint is missing for ${required.label}.${required.property}.`);
        }
    }
}

export async function migrateAccountSchema(driver: Driver, database: string): Promise<void> {
    await withSession(driver, database, async (session) => {
        await verifyRecipeGraph(session);
        for (const constraint of ACCOUNT_CONSTRAINTS) {
            await session.run(
                `CREATE CONSTRAINT ${constraint.name} IF NOT EXISTS FOR (node:${constraint.label}) REQUIRE node.${constraint.property} IS UNIQUE`,
            );
        }
        const constraints = await showConstraints(session);
        for (const required of ACCOUNT_CONSTRAINTS) {
            if (!constraints.some((constraint) => isConstraintPresent(constraint, required.label, required.property))) {
                throw new Error(`Account constraint migration did not install ${required.label}.${required.property}.`);
            }
        }
    });
}

export async function assertAccountSchemaReady(driver: Driver, database: string): Promise<void> {
    await driver.verifyConnectivity();
    await withSession(driver, database, async (session) => {
        await verifyRecipeGraph(session);
        const constraints = await showConstraints(session);
        for (const required of ACCOUNT_CONSTRAINTS) {
            if (!constraints.some((constraint) => isConstraintPresent(constraint, required.label, required.property))) {
                throw new Error(`Required account constraint is missing for ${required.label}.${required.property}.`);
            }
        }
    });
}
