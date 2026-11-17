import {
  compareRecipeSearchPositions,
  type RecipeSearchPosition,
} from "./recipe-search.cursor.js";
import type { RecipeSearchCandidate, RecipeSearchCriteria } from "./recipes.types.js";

export const RECIPE_SEARCH_PAGE_SIZE = 20;

export function positionOf(candidate: RecipeSearchCandidate): RecipeSearchPosition {
  return { matchedCount: candidate.matched, missingCount: candidate.missing, id: candidate.id };
}

/**
 * Applies the in-memory filters and orders by matched (desc), missing (asc), ID (asc).
 * Recipes without a cooking time fail a time limit; unrated recipes fail a rating minimum.
 */
export function filterAndRankCandidates(
  candidates: readonly RecipeSearchCandidate[],
  filters: Pick<RecipeSearchCriteria, "maxMinutes" | "minRating">,
): RecipeSearchCandidate[] {
  const { maxMinutes, minRating } = filters;
  return candidates
    .filter(
      (candidate) =>
        (maxMinutes === null || (candidate.minutes !== null && candidate.minutes <= maxMinutes)) &&
        (minRating === null ||
          (candidate.ratingAverage !== null && candidate.ratingAverage >= minRating)),
    )
    .sort((left, right) => compareRecipeSearchPositions(positionOf(left), positionOf(right)));
}

/** Returns up to `size` ranked candidates strictly after `position`, and whether more remain. */
export function pageAfter(
  ranked: readonly RecipeSearchCandidate[],
  position: RecipeSearchPosition | null,
  size: number,
): { page: RecipeSearchCandidate[]; hasMore: boolean } {
  let low = 0;
  if (position !== null) {
    let high = ranked.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const candidate = ranked[middle];
      if (candidate !== undefined && compareRecipeSearchPositions(positionOf(candidate), position) <= 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
  }
  return { page: ranked.slice(low, low + size), hasMore: low + size < ranked.length };
}
