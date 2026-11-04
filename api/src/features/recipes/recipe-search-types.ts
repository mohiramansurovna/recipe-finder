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
  ratings: {
    individual: number[];
    aggregate: number | null;
  };
}

export interface RecipeSearchRepository {
  getCuisineNames(): Promise<readonly string[]>;
  search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage>;
  getRecipeDetail(id: string): Promise<RecipeDetail | null>;
}

export function mapRecipeSearchResult(
  recipe: RecipeSearchRecord,
  criteria: Pick<RecipeSearchCriteria, "included" | "excluded">,
): RecipeSearchResult {
  const recipeIngredients = new Set(recipe.ingredientNames);
  const included = new Set(criteria.included);
  const matchedIngredients = criteria.included.filter((name) =>
    recipeIngredients.has(name),
  );
  const missingIngredients = recipe.ingredientNames.filter((name) => !included.has(name));
  const excludedIngredients = criteria.excluded.filter((name) =>
    recipeIngredients.has(name),
  );

  return {
    id: recipe.id,
    name: recipe.name,
    minutes: recipe.minutes,
    matchedIngredients,
    missingIngredients,
    excludedIngredients,
  };
}
