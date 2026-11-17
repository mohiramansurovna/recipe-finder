import type { Driver } from 'neo4j-driver';
import type {
    RecipeCandidateFilters,
    RecipeDetail,
    RecipeSearchCandidate,
    RecipeSearchRecord,
} from '../../../core/recipes/recipes.types.js';
import { RecipesRepository } from '../../../core/recipes/recipes.repository.js';
import {
    readStringArray,
    readMinutes,
    readAggregateRating,
    readOptionalStrings,
    readRatings,
    readString,
    readScore,
} from '../neo4j-readers.js';
import { withSession } from '../neo4j-sessions.js';
import {
    CANDIDATES_QUERY,
    GET_RECIPE_QUERY,
    GRAPH_STATE_QUERY,
    RECIPE_DETAIL_QUERY,
    SEARCH_RECORDS_QUERY,
} from '../queries/recipes.queries.js';

export class Neo4jRecipesRepository implements RecipesRepository {
    constructor(
        private readonly driver: Driver,
        private readonly database: string
    ) {}

    async getCuisineNames(): Promise<readonly string[]> {
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(GET_RECIPE_QUERY);
            return result.records.map(record => readString(record.get('name'), 'cuisine name'));
        });
    }

    async findSearchCandidates(filters: RecipeCandidateFilters): Promise<RecipeSearchCandidate[]> {
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(CANDIDATES_QUERY, {
                included: [...new Set(filters.included)],
                excluded: [...new Set(filters.excluded)],
                excludedCategories: [...new Set(filters.excludedCategories)],
                cuisines: [...new Set(filters.cuisines)],
            });
            return result.records.map(record => ({
                id: readString(record.get('id'), 'id'),
                matched: readScore(record, 'matched'),
                missing: readScore(record, 'missing'),
                minutes: readMinutes(record.get('minutes')),
                ratingAverage: readAggregateRating(record.get('ratingAverage')),
            }));
        });
    }

    async getSearchRecords(ids: readonly string[]): Promise<RecipeSearchRecord[]> {
        if (ids.length === 0) return [];
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(SEARCH_RECORDS_QUERY, { ids: [...ids] });
            return result.records.map(record => ({
                id: readString(record.get('id'), 'id'),
                name: readString(record.get('name'), 'name'),
                minutes: readMinutes(record.get('minutes')),
                ingredientNames: readStringArray(record.get('ingredientNames')),
            }));
        });
    }

    private async readGraphState(): Promise<{ identity: string; ratingFieldsReady: boolean }> {
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(GRAPH_STATE_QUERY);
            const record = result.records[0];
            if (record === undefined) throw new Error('Recipe import metadata is missing.');
            return {
                identity: readString(record.get('identity'), 'graph identity'),
                ratingFieldsReady: record.get('ratingFieldsReady') === true,
            };
        });
    }

    async getGraphIdentity(): Promise<string> {
        return (await this.readGraphState()).identity;
    }

    async isRatingFilterAvailable(): Promise<boolean> {
        return (await this.readGraphState()).ratingFieldsReady;
    }

    async getRecipeDetail(id: string): Promise<RecipeDetail | null> {
        return withSession(this.driver, this.database, async session => {
            const result = await session.run(RECIPE_DETAIL_QUERY, { id });
            const record = result.records[0];
            if (record === undefined) return null;

            const individualRatings = readRatings(record.get('individualRatings'));
            return {
                id: readString(record.get('id'), 'id'),
                name: readString(record.get('name'), 'name'),
                minutes: readMinutes(record.get('minutes')),
                instructions: readOptionalStrings(record.get('instructions'), 'instructions'),
                ingredients: readStringArray(record.get('ingredients')),
                cuisines: readStringArray(record.get('cuisines')),
                ratings: {
                    individual: individualRatings,
                    aggregate:
                        individualRatings.length === 0
                            ? readAggregateRating(record.get('aggregateRating'))
                            : readAggregateRating(record.get('combinedRating')),
                },
            };
        });
    }
}
