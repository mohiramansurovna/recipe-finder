import { createHash } from "node:crypto";

import type { RecipeSearchCriteria } from "./recipe-search-types.js";

export interface RecipeSearchPosition {
  missingCount: number;
  matchedCount: number;
  excludedCount: number;
  id: string;
}

export function compareRecipeSearchPositions(
  left: RecipeSearchPosition,
  right: RecipeSearchPosition,
): number {
  return (
    left.missingCount - right.missingCount ||
    right.matchedCount - left.matchedCount ||
    left.excludedCount - right.excludedCount ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

interface RecipeSearchCursor extends RecipeSearchPosition {
  version: 1;
  fingerprint: string;
}

export class InvalidRecipeSearchCursorError extends Error {
  constructor() {
    super("The recipe search cursor is invalid or does not match these criteria.");
    this.name = "InvalidRecipeSearchCursorError";
  }
}

export function recipeSearchFingerprint(
  criteria: Pick<
    RecipeSearchCriteria,
    "included" | "excluded" | "excludedCategories" | "cuisines" | "maxMinutes"
  >,
): string {
  const canonicalCriteria = JSON.stringify({
    included: [...new Set(criteria.included)].sort(),
    excluded: [...new Set(criteria.excluded)].sort(),
    excludedCategories: [...new Set(criteria.excludedCategories)].sort(),
    cuisines: [...new Set(criteria.cuisines)].sort(),
    maxMinutes: criteria.maxMinutes,
  });
  return createHash("sha256").update(canonicalCriteria).digest("base64url");
}

export function encodeRecipeSearchCursor(
  position: RecipeSearchPosition,
  fingerprint: string,
): string {
  const cursor: RecipeSearchCursor = { version: 1, fingerprint, ...position };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
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
      cursor.version !== 1 ||
      cursor.fingerprint !== expectedFingerprint ||
      typeof cursor.missingCount !== "number" ||
      !Number.isSafeInteger(cursor.missingCount) ||
      cursor.missingCount < 0 ||
      typeof cursor.matchedCount !== "number" ||
      !Number.isSafeInteger(cursor.matchedCount) ||
      cursor.matchedCount < 0 ||
      typeof cursor.excludedCount !== "number" ||
      !Number.isSafeInteger(cursor.excludedCount) ||
      cursor.excludedCount < 0 ||
      typeof cursor.id !== "string" ||
      cursor.id.length === 0
    ) {
      throw new InvalidRecipeSearchCursorError();
    }

    return {
      missingCount: cursor.missingCount,
      matchedCount: cursor.matchedCount,
      excludedCount: cursor.excludedCount,
      id: cursor.id,
    };
  } catch (error) {
    if (error instanceof InvalidRecipeSearchCursorError) throw error;
    throw new InvalidRecipeSearchCursorError();
  }
}
