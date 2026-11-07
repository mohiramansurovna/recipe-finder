import type {
  RecipeDetail,
  RecipeSearchCriteria,
  RecipeSearchPage,
} from "./recipes.types.js";

export interface RecipesRepository {
  getCuisineNames(): Promise<readonly string[]>;
  search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage>;
  getRecipeDetail(id: string): Promise<RecipeDetail | null>;
}
