import { describe, expect, it } from "vitest";

import { filterAndRankCandidates, pageAfter, positionOf } from "../api/src/core/recipes/recipe-search.ranking.js";
import type { RecipeSearchCandidate } from "../api/src/core/recipes/recipes.types.js";

const candidate = (
  id: string,
  matched: number,
  missing: number,
  minutes: number | null = 20,
  ratingAverage: number | null = null,
): RecipeSearchCandidate => ({ id, matched, missing, minutes, ratingAverage });

const none = { maxMinutes: null, minRating: null } as const;

describe("filterAndRankCandidates", () => {
  it("ranks by matched desc, missing asc, id asc and never by rating", () => {
    const ranked = filterAndRankCandidates(
      [
        candidate("d", 1, 0, 20, 5),
        candidate("c", 2, 4, 20, 1),
        candidate("b", 2, 1),
        candidate("a", 2, 1),
      ],
      none,
    );
    expect(ranked.map(({ id }) => id)).toEqual(["a", "b", "c", "d"]);
  });

  it("omits recipes over the time limit and recipes with no time", () => {
    const ranked = filterAndRankCandidates(
      [candidate("fast", 1, 0, 15), candidate("slow", 1, 0, 45), candidate("unknown", 1, 0, null)],
      { maxMinutes: 30, minRating: null },
    );
    expect(ranked.map(({ id }) => id)).toEqual(["fast"]);
  });

  it("omits unrated and low-rated recipes only when a minimum rating is set", () => {
    const all = [candidate("hi", 1, 0, 20, 4.2), candidate("mid", 1, 0, 20, 3.1), candidate("low", 1, 0, 20, 2.9), candidate("none", 1, 0, 20, null)];
    expect(filterAndRankCandidates(all, { maxMinutes: null, minRating: 3 }).map(({ id }) => id)).toEqual(["hi", "mid"]);
    expect(filterAndRankCandidates(all, { maxMinutes: null, minRating: 4 }).map(({ id }) => id)).toEqual(["hi"]);
    expect(filterAndRankCandidates(all, none)).toHaveLength(4);
  });

  it("does not mutate its input", () => {
    const input = [candidate("b", 1, 0), candidate("a", 2, 0)];
    filterAndRankCandidates(input, none);
    expect(input.map(({ id }) => id)).toEqual(["b", "a"]);
  });
});

describe("pageAfter", () => {
  const ranked = Array.from({ length: 7 }, (_, index) => candidate(`r${index}`, 3, index));

  it("returns the first page and whether more remain", () => {
    const { page, hasMore } = pageAfter(ranked, null, 3);
    expect(page.map(({ id }) => id)).toEqual(["r0", "r1", "r2"]);
    expect(hasMore).toBe(true);
  });

  it("continues strictly after a cursor position until the end", () => {
    const seen: string[] = [];
    let position = null as ReturnType<typeof positionOf> | null;
    for (let guard = 0; guard < 10; guard += 1) {
      const { page, hasMore } = pageAfter(ranked, position, 3);
      seen.push(...page.map(({ id }) => id));
      const last = page.at(-1);
      if (!hasMore || last === undefined) break;
      position = positionOf(last);
    }
    expect(seen).toEqual(ranked.map(({ id }) => id));
  });

  it("works when the cursor recipe is no longer a candidate", () => {
    const { page } = pageAfter(ranked, { matchedCount: 3, missingCount: 2, id: "zzz" }, 2);
    expect(page.map(({ id }) => id)).toEqual(["r3", "r4"]);
  });

  it("returns an empty page past the end", () => {
    expect(pageAfter(ranked, positionOf(ranked[6] as RecipeSearchCandidate), 3)).toEqual({ page: [], hasMore: false });
  });
});
