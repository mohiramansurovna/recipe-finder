import { createHash } from "crypto";
import { RecipeSearchCriteria } from "./recipes.types.js";

export interface RecipeSearchPosition {
  matchedCount: number;
  missingCount: number;
  id: string;
}

/** Most matched first, then fewest missing, then recipe ID. */
export function compareRecipeSearchPositions(
  left: RecipeSearchPosition,
  right: RecipeSearchPosition,
): number {
  return (
    right.matchedCount - left.matchedCount ||
    left.missingCount - right.missingCount ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

interface RecipeSearchCursor extends RecipeSearchPosition {
  version: 2;
  fingerprint: string;
}

export class InvalidRecipeSearchCursorError extends Error {
  constructor() {
    super("The recipe search cursor is invalid or does not match these criteria.");
    this.name = "InvalidRecipeSearchCursorError";
  }
}

type CandidateCriteria = Pick<
  RecipeSearchCriteria,
  "included" | "excluded" | "excludedCategories" | "cuisines"
>;

function canonicalCandidateCriteria(criteria: CandidateCriteria) {
  return {
    included: [...new Set(criteria.included)].sort(),
    excluded: [...new Set(criteria.excluded)].sort(),
    excludedCategories: [...new Set(criteria.excludedCategories)].sort(),
    cuisines: [...new Set(criteria.cuisines)].sort(),
  };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

/** Binds a cursor to every criterion, including the in-memory time and rating filters. */
export function recipeSearchFingerprint(
  criteria: CandidateCriteria & Pick<RecipeSearchCriteria, "maxMinutes" | "minRating">,
): string {
  return digest({
    ...canonicalCandidateCriteria(criteria),
    maxMinutes: criteria.maxMinutes,
    minRating: criteria.minRating,
  });
}

/** Cache key for candidate lists: ignores filters applied in memory and page position. */
export function recipeCandidateCacheKey(criteria: CandidateCriteria, graphIdentity: string): string {
  return `recipe-search:v1:${digest({ ...canonicalCandidateCriteria(criteria), graphIdentity })}`;
}

export function encodeRecipeSearchCursor(
  position: RecipeSearchPosition,
  fingerprint: string,
): string {
  const cursor: RecipeSearchCursor = { version: 2, fingerprint, ...position };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function decodeRecipeSearchCursor(
  token: string,
  expectedFingerprint: string,
): RecipeSearchPosition {
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    if (Buffer.from(json).toString("base64url") !== token) {
      throw new InvalidRecipeSearchCursorError();
    }

    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null) {
      throw new InvalidRecipeSearchCursorError();
    }

    const cursor = value as Partial<RecipeSearchCursor>;
    if (
      cursor.version !== 2 ||
      cursor.fingerprint !== expectedFingerprint ||
      !isCount(cursor.matchedCount) ||
      !isCount(cursor.missingCount) ||
      typeof cursor.id !== "string" ||
      cursor.id.length === 0
    ) {
      throw new InvalidRecipeSearchCursorError();
    }

    return {
      matchedCount: cursor.matchedCount,
      missingCount: cursor.missingCount,
      id: cursor.id,
    };
  } catch (error) {
    if (error instanceof InvalidRecipeSearchCursorError) throw error;
    throw new InvalidRecipeSearchCursorError();
  }
}
