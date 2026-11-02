import { describe, expect, it } from "vitest";

import {
  compareRecipeSearchPositions,
  decodeRecipeSearchCursor,
  encodeRecipeSearchCursor,
  InvalidRecipeSearchCursorError,
  recipeSearchFingerprint,
} from "../api/src/features/recipes/recipe-search-cursor.js";

const criteria = {
  included: ["rice", "chicken"],
  excluded: ["butter"],
  excludedCategories: ["dairy", "meat"],
  cuisines: ["Italian", "Mexican"],
  maxMinutes: 30,
};

describe("recipe search cursors", () => {
  it("orders rank positions by missing, matched, excluded, and stable id", () => {
    const positions = [
      { missingCount: 1, matchedCount: 2, excludedCount: 0, id: "c" },
      { missingCount: 0, matchedCount: 1, excludedCount: 0, id: "z" },
      { missingCount: 0, matchedCount: 2, excludedCount: 1, id: "b" },
      { missingCount: 0, matchedCount: 2, excludedCount: 0, id: "a" },
      { missingCount: 0, matchedCount: 2, excludedCount: 0, id: "b" },
    ];

    expect([...positions].sort(compareRecipeSearchPositions)).toEqual([
      positions[3],
      positions[4],
      positions[2],
      positions[1],
      positions[0],
    ]);
  });

  it("binds a cursor to canonical criteria and round-trips the last result position", () => {
    const fingerprint = recipeSearchFingerprint(criteria);
    const cursor = encodeRecipeSearchCursor(
      { missingCount: 2, matchedCount: 1, excludedCount: 0, id: "recipe-20" },
      fingerprint,
    );

    expect(
      recipeSearchFingerprint({
        ...criteria,
        included: ["chicken", "rice", "rice"],
        excludedCategories: ["meat", "dairy", "meat"],
        cuisines: ["Mexican", "Italian", "Italian"],
      }),
    ).toBe(fingerprint);
    expect(decodeRecipeSearchCursor(cursor, fingerprint)).toEqual({
      missingCount: 2,
      matchedCount: 1,
      excludedCount: 0,
      id: "recipe-20",
    });
  });

  it("rejects a cursor from different search criteria", () => {
    const fingerprint = recipeSearchFingerprint(criteria);
    const cursor = encodeRecipeSearchCursor(
      { missingCount: 0, matchedCount: 2, excludedCount: 0, id: "recipe-1" },
      fingerprint,
    );

    expect(() =>
      decodeRecipeSearchCursor(cursor, recipeSearchFingerprint({ ...criteria, maxMinutes: 60 })),
    ).toThrow(InvalidRecipeSearchCursorError);
  });

  it("rejects a cursor when category or cuisine filters change", () => {
    const fingerprint = recipeSearchFingerprint(criteria);
    const cursor = encodeRecipeSearchCursor(
      { missingCount: 0, matchedCount: 2, excludedCount: 0, id: "recipe-1" },
      fingerprint,
    );

    expect(() =>
      decodeRecipeSearchCursor(
        cursor,
        recipeSearchFingerprint({ ...criteria, excludedCategories: ["dairy"] }),
      ),
    ).toThrow(InvalidRecipeSearchCursorError);
    expect(() =>
      decodeRecipeSearchCursor(
        cursor,
        recipeSearchFingerprint({ ...criteria, cuisines: ["Italian"] }),
      ),
    ).toThrow(InvalidRecipeSearchCursorError);
  });

  it("preserves the last item of a page as the exclusive next-page boundary", () => {
    const fingerprint = recipeSearchFingerprint(criteria);
    const pageBoundary = {
      missingCount: 2,
      matchedCount: 1,
      excludedCount: 1,
      id: "recipe-20",
    };
    const cursor = encodeRecipeSearchCursor(pageBoundary, fingerprint);
    const decoded = decodeRecipeSearchCursor(cursor, fingerprint);
    const nextPosition = { ...pageBoundary, id: "recipe-21" };

    expect(decoded).toEqual(pageBoundary);
    expect(compareRecipeSearchPositions(decoded, nextPosition)).toBeLessThan(0);
  });

  it.each(["", "not-base64", Buffer.from("{").toString("base64url")])(
    "rejects malformed cursor %j",
    (cursor) => {
      expect(() =>
        decodeRecipeSearchCursor(cursor, recipeSearchFingerprint(criteria)),
      ).toThrow(InvalidRecipeSearchCursorError);
    },
  );
});
