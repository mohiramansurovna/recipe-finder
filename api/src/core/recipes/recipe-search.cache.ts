import type { RecipeSearchCandidate } from "./recipes.types.js";

/** Cache for unfiltered, unranked candidate lists. A failure must behave like a miss. */
export interface RecipeCandidateCache {
  get(key: string): Promise<RecipeSearchCandidate[] | null>;
  set(key: string, candidates: readonly RecipeSearchCandidate[]): Promise<void>;
}
