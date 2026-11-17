export interface RecipeSearchCriteria {
    included: readonly string[];
    excluded: readonly string[];
    excludedCategories: readonly string[];
    cuisines: readonly string[];
    maxMinutes: number | null;
    minRating: 3 | 4 | null;
    cursor: string | null;
}

/** Criteria that decide which recipes are candidates; time and rating filters are applied in memory. */
export type RecipeCandidateFilters = Pick<
    RecipeSearchCriteria,
    'included' | 'excluded' | 'excludedCategories' | 'cuisines'
>;

export interface RecipeSearchCandidate {
    id: string;
    matched: number;
    missing: number;
    minutes: number | null;
    ratingAverage: number | null;
}

export interface RecipeSearchRecord {
    id: string;
    name: string;
    minutes: number | null;
    ingredientNames: readonly string[];
}

export interface RecipeSearchResult {
    id: string;
    name: string;
    minutes: number | null;
    matchedIngredients: string[];
    missingIngredients: string[];
    excludedIngredients: string[];
}

export interface RecipeSearchPage {
    recipes: RecipeSearchResult[];
    totalCount: number;
    nextCursor: string | null;
}

export interface RecipeDetail {
    id: string;
    name: string;
    minutes: number | null;
    instructions: string[] | null;
    ingredients: string[];
    cuisines: string[];
    ratings: { individual: number[]; aggregate: number | null };
}
