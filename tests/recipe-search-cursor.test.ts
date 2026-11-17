import { describe, expect, it } from "vitest";

import {
  compareRecipeSearchPositions,
  decodeRecipeSearchCursor,
  encodeRecipeSearchCursor,
  InvalidRecipeSearchCursorError,
  recipeCandidateCacheKey,
  recipeSearchFingerprint,
} from "../api/src/core/recipes/recipe-search.cursor.js";

const criteria = {
  included: ["rice", "chicken"],
  excluded: ["butter"],
  excludedCategories: ["dairy", "meat"],
  cuisines: ["Italian", "Mexican"],
  maxMinutes: 30,
  minRating: null,
} as const;

describe("recipe search cursors", () => {
  it("orders by most matched, then fewest missing, then stable id", () => {
    const positions = [
      { matchedCount: 1, missingCount: 0, id: "z" },
      { matchedCount: 2, missingCount: 3, id: "a" },
      { matchedCount: 2, missingCount: 1, id: "c" },
      { matchedCount: 2, missingCount: 1, id: "b" },
    ];

    expect([...positions].sort(compareRecipeSearchPositions)).toEqual([
      positions[3],
      positions[2],
      positions[1],
      positions[0],
    ]);
  });

  it("binds a cursor to canonical criteria and round-trips the last result position", () => {
    const fingerprint = recipeSearchFingerprint(criteria);
    const position = { matchedCount: 1, missingCount: 2, id: "recipe-20" };
    const cursor = encodeRecipeSearchCursor(position, fingerprint);

    expect(
      recipeSearchFingerprint({
        ...criteria,
        included: ["chicken", "rice", "rice"],
        excludedCategories: ["meat", "dairy", "meat"],
        cuisines: ["Mexican", "Italian", "Italian"],
      }),
    ).toBe(fingerprint);
    expect(decodeRecipeSearchCursor(cursor, fingerprint)).toEqual(position);
  });

  it.each([
    { maxMinutes: 60 },
    { minRating: 4 as const },
    { excludedCategories: ["dairy"] },
    { cuisines: ["Italian"] },
    { excluded: [] },
    { included: ["rice"] },
  ])("rejects a cursor when criteria change: %j", (change) => {
    const cursor = encodeRecipeSearchCursor(
      { matchedCount: 2, missingCount: 0, id: "recipe-1" },
      recipeSearchFingerprint(criteria),
    );

    expect(() =>
      decodeRecipeSearchCursor(cursor, recipeSearchFingerprint({ ...criteria, ...change })),
    ).toThrow(InvalidRecipeSearchCursorError);
  });

  it("rejects a version 1 cursor", () => {
    const fingerprint = recipeSearchFingerprint(criteria);
    const legacy = Buffer.from(
      JSON.stringify({ version: 1, fingerprint, missingCount: 0, matchedCount: 2, excludedCount: 0, id: "r" }),
    ).toString("base64url");

    expect(() => decodeRecipeSearchCursor(legacy, fingerprint)).toThrow(InvalidRecipeSearchCursorError);
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

describe("recipe candidate cache key", () => {
  const key = (change: Record<string, unknown> = {}, graph = "g1") =>
    recipeCandidateCacheKey({ ...criteria, ...change }, graph);

  it("ignores ingredient order, duplicates, time and rating filters", () => {
    expect(key({ included: ["chicken", "rice", "chicken"], maxMinutes: 15, minRating: 4 })).toBe(key());
  });

  it("differs when ingredients, exclusions, cuisines or the graph change", () => {
    const keys = new Set([
      key(),
      key({ included: ["rice"] }),
      key({ excluded: [] }),
      key({ excludedCategories: ["dairy"] }),
      key({ cuisines: ["Italian"] }),
      key({}, "g2"),
    ]);
    expect(keys.size).toBe(6);
  });
});
