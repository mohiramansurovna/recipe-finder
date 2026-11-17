import { describe, expect, it, vi } from "vitest";

import {
  IngredientsRequiredError,
  InvalidRecipeCuisineError,
  RatingFilterUnavailableError,
  RecipesService,
} from "../api/src/application/services/recipes.service.js";
import type { RecipeCandidateCache } from "../api/src/core/recipes/recipe-search.cache.js";
import { InvalidRecipeSearchCursorError } from "../api/src/core/recipes/recipe-search.cursor.js";
import type { RecipesRepository } from "../api/src/core/recipes/recipes.repository.js";
import type {
  RecipeSearchCandidate,
  RecipeSearchCriteria,
  RecipeSearchRecord,
} from "../api/src/core/recipes/recipes.types.js";

const criteria = (change: Partial<RecipeSearchCriteria> = {}): RecipeSearchCriteria => ({
  included: ["rice", "chicken"],
  excluded: [],
  excludedCategories: [],
  cuisines: [],
  maxMinutes: null,
  minRating: null,
  cursor: null,
  ...change,
});

const candidate = (
  id: string,
  matched: number,
  missing: number,
  minutes: number | null = 20,
  ratingAverage: number | null = null,
): RecipeSearchCandidate => ({ id, matched, missing, minutes, ratingAverage });

function repositoryWith(
  candidates: RecipeSearchCandidate[],
  options: { ratingReady?: boolean } = {},
) {
  const repository = {
    getCuisineNames: vi.fn().mockResolvedValue(["Italian"]),
    findSearchCandidates: vi.fn().mockResolvedValue(candidates),
    getSearchRecords: vi.fn(async (ids: readonly string[]): Promise<RecipeSearchRecord[]> =>
      [...ids].reverse().map((id) => ({ id, name: `Recipe ${id}`, minutes: 20, ingredientNames: ["rice", "salt"] })),
    ),
    getGraphIdentity: vi.fn().mockResolvedValue("graph-1"),
    isRatingFilterAvailable: vi.fn().mockResolvedValue(options.ratingReady ?? true),
    getRecipeDetail: vi.fn(),
  } satisfies RecipesRepository;
  return repository;
}

function memoryCache() {
  const entries = new Map<string, RecipeSearchCandidate[]>();
  const cache: RecipeCandidateCache = {
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    set: vi.fn(async (key: string, value: readonly RecipeSearchCandidate[]) => {
      entries.set(key, [...value]);
    }),
  };
  return { cache, entries };
}

describe("RecipesService.search", () => {
  it("requires at least one included ingredient", async () => {
    const repository = repositoryWith([]);
    await expect(new RecipesService(repository).search(criteria({ included: [], excluded: ["salt"] }))).rejects.toBeInstanceOf(
      IngredientsRequiredError,
    );
    expect(repository.findSearchCandidates).not.toHaveBeenCalled();
  });

  it("rejects unavailable cuisine selections before searching", async () => {
    const repository = repositoryWith([]);
    await expect(new RecipesService(repository).search(criteria({ cuisines: ["Unknown"] }))).rejects.toBeInstanceOf(
      InvalidRecipeCuisineError,
    );
    expect(repository.findSearchCandidates).not.toHaveBeenCalled();
  });

  it("ranks in memory, keeps rank order for the page, and reports the filtered total", async () => {
    const repository = repositoryWith([candidate("c", 1, 0), candidate("b", 2, 3), candidate("a", 2, 1)]);
    const page = await new RecipesService(repository).search(criteria());

    expect(page.recipes.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(page.totalCount).toBe(3);
    expect(page.nextCursor).toBeNull();
    expect(repository.getSearchRecords).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("pages through all candidates with consistent cursors", async () => {
    const many = Array.from({ length: 45 }, (_, index) => candidate(`r${String(index).padStart(2, "0")}`, 2, index % 3));
    const service = new RecipesService(repositoryWith(many));
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 5; guard += 1) {
      const page = await service.search(criteria({ cursor }));
      expect(page.totalCount).toBe(45);
      seen.push(...page.recipes.map(({ id }) => id));
      cursor = page.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
  });

  it("applies time and rating filters, hiding unrated recipes only when rating is requested", async () => {
    const repository = repositoryWith([
      candidate("good", 2, 0, 15, 4.5),
      candidate("slow", 2, 0, 90, 4.5),
      candidate("low", 2, 0, 15, 2),
      candidate("unrated", 2, 0, 15, null),
    ]);
    const service = new RecipesService(repository);

    expect((await service.search(criteria({ maxMinutes: 30, minRating: 4 }))).recipes.map(({ id }) => id)).toEqual(["good"]);
    expect((await service.search(criteria({ maxMinutes: 30 }))).totalCount).toBe(3);
  });

  it("reports an unavailable rating filter on an unmigrated graph without blocking other searches", async () => {
    const repository = repositoryWith([candidate("a", 1, 0)], { ratingReady: false });
    const service = new RecipesService(repository);

    await expect(service.search(criteria({ minRating: 3 }))).rejects.toBeInstanceOf(RatingFilterUnavailableError);
    await expect(service.search(criteria())).resolves.toMatchObject({ totalCount: 1 });
  });

  it("rejects a cursor from different criteria", async () => {
    const many = Array.from({ length: 30 }, (_, index) => candidate(`r${String(index).padStart(2, "0")}`, 1, 0));
    const service = new RecipesService(repositoryWith(many));
    const first = await service.search(criteria());

    await expect(service.search(criteria({ cursor: first.nextCursor, maxMinutes: 30 }))).rejects.toBeInstanceOf(
      InvalidRecipeSearchCursorError,
    );
  });
});

describe("RecipesService candidate cache", () => {
  it("queries once for the same search across pages, word order and filter changes", async () => {
    const many = Array.from({ length: 30 }, (_, index) => candidate(`r${String(index).padStart(2, "0")}`, 1, 0, 20, 4));
    const repository = repositoryWith(many);
    const { cache } = memoryCache();
    const service = new RecipesService(repository, cache);

    const first = await service.search(criteria());
    await service.search(criteria({ cursor: first.nextCursor }));
    await service.search(criteria({ included: ["chicken", "rice", "chicken"] }));
    await service.search(criteria({ maxMinutes: 30, minRating: 4 }));

    expect(repository.findSearchCandidates).toHaveBeenCalledTimes(1);
  });

  it("queries again when ingredients, exclusions or cuisines differ, or the graph changes", async () => {
    const repository = repositoryWith([candidate("a", 1, 0)]);
    const service = new RecipesService(repository, memoryCache().cache);

    await service.search(criteria());
    await service.search(criteria({ included: ["rice"] }));
    await service.search(criteria({ excluded: ["salt"] }));
    await service.search(criteria({ cuisines: ["Italian"] }));
    repository.getGraphIdentity.mockResolvedValue("graph-2");
    await service.search(criteria());

    expect(repository.findSearchCandidates).toHaveBeenCalledTimes(5);
  });

  it("falls back to the database when the cache fails", async () => {
    const repository = repositoryWith([candidate("a", 1, 0)]);
    const cache: RecipeCandidateCache = {
      get: vi.fn().mockRejectedValue(new Error("redis down")),
      set: vi.fn().mockRejectedValue(new Error("redis down")),
    };

    await expect(new RecipesService(repository, cache).search(criteria())).resolves.toMatchObject({ totalCount: 1 });
    expect(repository.findSearchCandidates).toHaveBeenCalledTimes(1);
  });
});
