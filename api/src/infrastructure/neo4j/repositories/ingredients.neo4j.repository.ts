import type neo4j from 'neo4j-driver';

import type {
    IngredientAlias,
    IngredientsRepository,
} from '../../../core/ingredients/ingredients.repository.js';
import { withSession } from '../neo4j-sessions.js';
import {
    GET_INGREDIENT_ALIAS_QUERY,
    GET_INGREDIENT_QUERY,
    GET_INGREDIENT_TYPES_QUERY,
} from '../queries/ingredients.queries.js';

export class Neo4jIngredientsRepository implements IngredientsRepository {
    constructor(
        private readonly driver: neo4j.Driver,
        private readonly database: string
    ) {}

    async getIngredientNames(): Promise<readonly string[]> {
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(GET_INGREDIENT_QUERY);
            return result.records.map(record => {
                const name: unknown = record.get('name');
                if (typeof name !== 'string') {
                    throw new Error('Neo4j returned an ingredient without a valid name.');
                }
                return name;
            });
        });
    }

    async getIngredientAliases(): Promise<readonly IngredientAlias[]> {
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(GET_INGREDIENT_ALIAS_QUERY);
            return result.records.map(record => {
                const alias: unknown = record.get('alias');
                const canonicalName: unknown = record.get('canonicalName');
                if (typeof alias !== 'string' || typeof canonicalName !== 'string') {
                    throw new Error('Neo4j returned an ingredient alias without valid names.');
                }
                return { alias, canonicalName };
            });
        });
    }

    async getIngredientCategories(): Promise<readonly string[]> {
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(GET_INGREDIENT_TYPES_QUERY);
            return result.records.map(record => {
                const name: unknown = record.get('name');
                if (typeof name !== 'string') {
                    throw new Error('Neo4j returned an ingredient category without a valid name.');
                }
                return name;
            });
        });
    }
}
