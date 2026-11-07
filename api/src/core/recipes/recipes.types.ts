export interface RecipeSearchCriteria {
    included: readonly string[];
    excluded: readonly string[];
    excludedCategories: readonly string[];
    cuisines: readonly string[];
    maxMinutes: number | null;
    cursor: string | null;
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

export interface ScoredRecipeSearchRecord {
    recipe: RecipeSearchRecord;
    position: { missingCount: number; matchedCount: number; excludedCount: number; id: string };
}