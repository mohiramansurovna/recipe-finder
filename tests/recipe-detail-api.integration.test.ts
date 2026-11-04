import { describe, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import request from "supertest";

import { createApiApp } from "../api/src/app.js";
import { Neo4jRecipeSearchRepository } from "../api/src/features/recipes/neo4j-recipe-search-repository.js";
import type {
  RecipeDetail,
  RecipeSearchPage,
  RecipeSearchRepository,
} from "../api/src/features/recipes/recipe-search-types.js";
import type { IngredientRepository } from "../api/src/features/ingredients/ingredient-repository.js";

class TestIngredientRepository implements IngredientRepository {
  async getIngredientNames() {
    return [];
  }

  async getIngredientAliases() {
    return [];
  }

  async getIngredientCategories() {
    return [];
  }
}

class TestRecipeRepository implements RecipeSearchRepository {
  constructor(
    private readonly detail: RecipeDetail | null,
    private readonly failure?: Error,
  ) {}

  async getCuisineNames() {
    return [];
  }

  async search(): Promise<RecipeSearchPage> {
    return { recipes: [], totalCount: 0, nextCursor: null };
  }

  async getRecipeDetail() {
    if (this.failure !== undefined) throw this.failure;
    return this.detail;
  }
}

const availableDetail: RecipeDetail = {
  id: "recipe-1",
  name: "Soup",
  minutes: 25,
  instructions: ["Simmer.", "Serve."],
  ingredients: ["salt", "water"],
  cuisines: ["Italian"],
  ratings: { individual: [5, 3], aggregate: null },
};

function apiFor(detail: RecipeDetail | null, failure?: Error) {
  return createApiApp(
    new TestIngredientRepository(),
    100,
    new TestRecipeRepository(detail, failure),
  );
}

describe("recipe detail API", () => {
  it("returns typed recipe details and individual ratings", async () => {
    await request(apiFor(availableDetail))
      .get("/api/recipes/recipe-1")
      .expect(200)
      .expect(availableDetail);
  });

  it("returns an explicit not-found response for unknown recipes", async () => {
    await request(apiFor(null))
      .get("/api/recipes/missing")
      .expect(404)
      .expect({
        error: {
          code: "RECIPE_NOT_FOUND",
          message: "The requested recipe was not found.",
        },
      });
  });

  it("rejects empty recipe IDs and reports graph failures as service errors", async () => {
    await request(apiFor(null)).get("/api/recipes/%20").expect(400);

    const graphError = new Error("connection refused");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await request(apiFor(null, graphError))
        .get("/api/recipes/recipe-1")
        .expect(503)
        .expect({
          error: {
            code: "GRAPH_UNAVAILABLE",
            message: "Recipe details are temporarily unavailable.",
          },
        });
      expect(consoleError).toHaveBeenCalledWith(
        "Recipe details are temporarily unavailable.",
        graphError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("Neo4j recipe detail repository", () => {
  it("maps graph fields, prefers individual ratings, and omits unavailable values", async () => {
    const values: Record<string, unknown> = {
      id: "recipe-1",
      name: "Soup",
      minutes: neo4j.int(25),
      instructions: ["Simmer.", "Serve."],
      aggregateRating: 4.5,
      ingredients: ["salt", "water"],
      cuisines: ["Italian"],
      individualRatings: [neo4j.int(5), neo4j.int(3)],
    };
    const record = { get: (field: string) => values[field] };
    const session = {
      run: vi.fn().mockResolvedValue({ records: [record] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const driver = { session: vi.fn(() => session) } as unknown as Driver;
    const repository = new Neo4jRecipeSearchRepository(driver, "neo4j");

    await expect(repository.getRecipeDetail("recipe-1")).resolves.toEqual({
      ...availableDetail,
      ratings: { individual: [5, 3], aggregate: null },
    });
    const [query, parameters] = session.run.mock.calls[0] ?? [];
    expect(query).toContain("(recipe)-[:HAS_RATING]->(rating:Rating)");
    expect(query).not.toContain("user");
    expect(parameters).toEqual({ id: "recipe-1" });
    expect(session.close).toHaveBeenCalledOnce();
  });

  it("uses the source aggregate only when individual rating records are absent", async () => {
    const values: Record<string, unknown> = {
      id: "recipe-2",
      name: "Salad",
      minutes: null,
      instructions: null,
      aggregateRating: 4.25,
      ingredients: ["lettuce"],
      cuisines: [],
      individualRatings: [],
    };
    const session = {
      run: vi.fn().mockResolvedValue({ records: [{ get: (field: string) => values[field] }] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const driver = { session: vi.fn(() => session) } as unknown as Driver;
    const repository = new Neo4jRecipeSearchRepository(driver, "neo4j");

    await expect(repository.getRecipeDetail("recipe-2")).resolves.toEqual({
      id: "recipe-2",
      name: "Salad",
      minutes: null,
      instructions: null,
      ingredients: ["lettuce"],
      cuisines: [],
      ratings: { individual: [], aggregate: 4.25 },
    });
  });

  it("returns null when the graph has no matching recipe", async () => {
    const session = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const driver = { session: vi.fn(() => session) } as unknown as Driver;
    const repository = new Neo4jRecipeSearchRepository(driver, "neo4j");

    await expect(repository.getRecipeDetail("missing")).resolves.toBeNull();
    expect(session.close).toHaveBeenCalledOnce();
  });
});
