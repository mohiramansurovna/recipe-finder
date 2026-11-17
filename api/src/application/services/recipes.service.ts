import type {
    RecipeDetail,
    RecipeSearchCandidate,
    RecipeSearchCriteria,
    RecipeSearchPage,
} from '../../core/recipes/recipes.types.js';
import type { RecipesRepository } from '../../core/recipes/recipes.repository.js';
import type { RecipeCandidateCache } from '../../core/recipes/recipe-search.cache.js';
import {
    decodeRecipeSearchCursor,
    encodeRecipeSearchCursor,
    recipeCandidateCacheKey,
    recipeSearchFingerprint,
} from '../../core/recipes/recipe-search.cursor.js';
import {
    filterAndRankCandidates,
    pageAfter,
    positionOf,
    RECIPE_SEARCH_PAGE_SIZE,
} from '../../core/recipes/recipe-search.ranking.js';
import { RecipesMapper } from '../../infrastructure/mappers/recipes.mapper.js';

export class InvalidRecipeCuisineError extends Error {
    constructor() {
        super('Cuisine selections must match available recipe cuisines.');
        this.name = 'InvalidRecipeCuisineError';
    }
}

export class IngredientsRequiredError extends Error {
    constructor() {
        super('Add at least one ingredient to search.');
        this.name = 'IngredientsRequiredError';
    }
}

export class RatingFilterUnavailableError extends Error {
    constructor() {
        super('The rating filter is unavailable until the recipe graph rating migration has run.');
        this.name = 'RatingFilterUnavailableError';
    }
}

export class RecipesService {
    constructor(
        private readonly repository?: RecipesRepository,
        private readonly cache?: RecipeCandidateCache,
    ) {}

    get isAvailable(): boolean {
        return this.repository !== undefined;
    }

    async getCuisineNames(): Promise<readonly string[]> {
        if (this.repository === undefined) throw new Error('Recipe search is unavailable.');
        return this.repository.getCuisineNames();
    }

    async search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage> {
        const repository = this.repository;
        if (repository === undefined) throw new Error('Recipe search is unavailable.');
        if (criteria.included.length === 0) throw new IngredientsRequiredError();
        const availableCuisines = new Set(await repository.getCuisineNames());
        if (criteria.cuisines.some(cuisine => !availableCuisines.has(cuisine))) {
            throw new InvalidRecipeCuisineError();
        }
        const position =
            criteria.cursor === null
                ? null
                : decodeRecipeSearchCursor(criteria.cursor, recipeSearchFingerprint(criteria));
        if (criteria.minRating !== null && !(await repository.isRatingFilterAvailable())) {
            throw new RatingFilterUnavailableError();
        }

        const candidates = await this.loadCandidates(repository, criteria);
        const ranked = filterAndRankCandidates(candidates, criteria);
        const { page, hasMore } = pageAfter(ranked, position, RECIPE_SEARCH_PAGE_SIZE);

        const records = new Map(
            (await repository.getSearchRecords(page.map(candidate => candidate.id))).map(
                record => [record.id, record] as const,
            ),
        );
        const recipes = page.flatMap(candidate => {
            const record = records.get(candidate.id);
            return record === undefined ? [] : [RecipesMapper.toDomain(record, criteria)];
        });
        const last = page.at(-1);
        return {
            recipes,
            totalCount: ranked.length,
            nextCursor:
                hasMore && last !== undefined
                    ? encodeRecipeSearchCursor(positionOf(last), recipeSearchFingerprint(criteria))
                    : null,
        };
    }

    private async loadCandidates(
        repository: RecipesRepository,
        criteria: RecipeSearchCriteria,
    ): Promise<readonly RecipeSearchCandidate[]> {
        const cache = this.cache;
        const filters = {
            included: criteria.included,
            excluded: criteria.excluded,
            excludedCategories: criteria.excludedCategories,
            cuisines: criteria.cuisines,
        };
        if (cache === undefined) return repository.findSearchCandidates(filters);
        let key: string | null = null;
        try {
            key = recipeCandidateCacheKey(criteria, await repository.getGraphIdentity());
            const cached = await cache.get(key);
            if (cached !== null) return cached;
        } catch {
            // A cache failure behaves like a miss.
        }
        const candidates = await repository.findSearchCandidates(filters);
        if (key !== null) {
            try {
                await cache.set(key, candidates);
            } catch {
                // Ignore: the cache is an optimisation only.
            }
        }
        return candidates;
    }

    async getRecipeDetail(id: string): Promise<RecipeDetail | null> {
        if (this.repository === undefined) throw new Error('Recipe search is unavailable.');
        return this.repository.getRecipeDetail(id);
    }
}
