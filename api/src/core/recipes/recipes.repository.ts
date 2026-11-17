import type {
  RecipeCandidateFilters,
  RecipeDetail,
  RecipeSearchCandidate,
  RecipeSearchRecord,
} from "./recipes.types.js";

export interface RecipesRepository {
  getCuisineNames(): Promise<readonly string[]>;
  /** Recipes using at least one included ingredient, minus excluded ingredients, categories and other cuisines. Unordered. */
  findSearchCandidates(filters: RecipeCandidateFilters): Promise<RecipeSearchCandidate[]>;
  /** Display records for the given recipe IDs, in any order. */
  getSearchRecords(ids: readonly string[]): Promise<RecipeSearchRecord[]>;
  /** Identifies the imported graph; changes when the graph is re-imported. */
  getGraphIdentity(): Promise<string>;
  /** False until the rating averages used by the rating filter have been migrated. */
  isRatingFilterAvailable(): Promise<boolean>;
  getRecipeDetail(id: string): Promise<RecipeDetail | null>;
}
