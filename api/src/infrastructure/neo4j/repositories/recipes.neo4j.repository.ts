import neo4j from "neo4j-driver";
import type { Driver } from 'neo4j-driver';
import type {
    RecipeSearchCriteria,
    RecipeDetail,
    RecipeSearchPage,
    ScoredRecipeSearchRecord,
} from '../../../core/recipes/recipes.types.js';
import { RecipesRepository } from '../../../core/recipes/recipes.repository.js';
import { RecipesMapper } from '../../mappers/recipes.mapper.js';
import {
    compareRecipeSearchPositions,
    decodeRecipeSearchCursor,
    encodeRecipeSearchCursor,
    recipeSearchFingerprint,
} from '../../../core/recipes/recipe-search.cursor.js';
import {
    readAggregateRating,
    readStringArray,
    readMinutes,
    readOptionalStrings,
    readRatings,
    readString,
    readTotalCount,
    readScore,
} from '../neo4j-readers.js';
import { withSession } from '../neo4j-sessions.js';
import {
    COUNT_QUERY,
    GET_RECIPE_QUERY,
    PAGE_SIZE,
    RECIPE_DETAIL_QUERY,
    SEARCH_QUERY,
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

    async search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage> {
        const fingerprint = recipeSearchFingerprint(criteria);
        const position =
            criteria.cursor === null
                ? null
                : decodeRecipeSearchCursor(criteria.cursor, fingerprint);
        return withSession(this.driver, this.database, async session => {
            const filterParams = {
                excludedCategories: [...new Set(criteria.excludedCategories)],
                cuisines: [...new Set(criteria.cuisines)],
                maxMinutes: criteria.maxMinutes,
            };
            const countResult = await session.run(COUNT_QUERY, filterParams);
            const totalCount = readTotalCount(countResult.records[0]);
            const result = await session.run(SEARCH_QUERY, {
                included: [...new Set(criteria.included)],
                excluded: [...new Set(criteria.excluded)],
                ...filterParams,
                cursorMissing: position?.missingCount ?? null,
                cursorMatched: position?.matchedCount ?? null,
                cursorExcluded: position?.excludedCount ?? null,
                cursorId: position?.id ?? null,
                limit: neo4j.int(PAGE_SIZE + 1),
            });

            const records: ScoredRecipeSearchRecord[] = result.records.map(record => {
                const id = readString(record.get('id'), 'id');
                return {
                    recipe: {
                        id,
                        name: readString(record.get('name'), 'name'),
                        minutes: readMinutes(record.get('minutes')),
                        ingredientNames: readStringArray(record.get('ingredientNames')),
                    },
                    position: {
                        id,
                        missingCount: readScore(record, 'missingCount'),
                        matchedCount: readScore(record, 'matchedCount'),
                        excludedCount: readScore(record, 'excludedCount'),
                    },
                };
            });

            for (let index = 1; index < records.length; index += 1) {
                const previous = records[index - 1];
                const current = records[index];
                if (
                    previous !== undefined &&
                    current !== undefined &&
                    compareRecipeSearchPositions(previous.position, current.position) > 0
                ) {
                    throw new Error('Neo4j returned recipe results in an invalid rank order.');
                }
            }

            const hasMore = records.length > PAGE_SIZE;
            const pageRecords = records.slice(0, PAGE_SIZE);
            const lastRecord = pageRecords.at(-1);
            const nextCursor =
                hasMore && lastRecord !== undefined
                    ? encodeRecipeSearchCursor(lastRecord.position, fingerprint)
                    : null;

            return {
                recipes: pageRecords.map(({ recipe }) => RecipesMapper.toDomain(recipe, criteria)),
                totalCount,
                nextCursor,
            };
        });
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
                            : null,
                },
            };
        });
    }
}
