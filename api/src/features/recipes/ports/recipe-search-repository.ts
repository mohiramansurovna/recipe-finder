import type {
  RecipeDetail,
  RecipeSearchCriteria,
  RecipeSearchPage,
} from "../recipe-search-types.js";

export interface RecipeSearchRepository {
  getCuisineNames(): Promise<readonly string[]>;
  search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage>;
  getRecipeDetail(id: string): Promise<RecipeDetail | null>;
}
