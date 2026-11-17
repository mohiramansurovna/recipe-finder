import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApiApp } from "../api/src/app.js";
import type {
  RecipeCandidateFilters,
  RecipeSearchCandidate,
  RecipeSearchRecord,
} from "../api/src/core/recipes/recipes.types.js";
import type { IngredientsRepository } from "../api/src/core/ingredients/ingredients.repository.js";
import type { RecipesRepository } from "../api/src/core/recipes/recipes.repository.js";

class TestIngredientRepository implements IngredientsRepository {
  async getIngredientNames() {
    return ["butter", "chicken"];
  }

  async getIngredientAliases() {
    return [];
  }

  async getIngredientCategories() {
    return ["dairy", "fish/seafood", "meat", "nuts"];
  }
}

class TestRecipeSearchRepository implements RecipesRepository {
  readonly requests: RecipeCandidateFilters[] = [];

  constructor(
    private readonly candidates: RecipeSearchCandidate[] = [],
    private readonly failure?: Error,
  ) {}

  async getCuisineNames() {
    return ["Italian", "Mexican"];
  }

  async getRecipeDetail() {
    return null;
  }

  async findSearchCandidates(filters: RecipeCandidateFilters): Promise<RecipeSearchCandidate[]> {
    this.requests.push(filters);
    if (this.failure) throw this.failure;
    return this.candidates;
  }

  async getSearchRecords(ids: readonly string[]): Promise<RecipeSearchRecord[]> {
    return ids.map((id) => ({
      id,
      name: `Recipe ${id}`,
      minutes: 20,
      ingredientNames: ["chicken", "salt"],
    }));
  }

  async getGraphIdentity() {
    return "test-graph";
  }

  async isRatingFilterAvailable() {
    return true;
  }
}

const validRequest = {
  included: ["chicken"],
  excluded: ["butter"],
  excludedCategories: ["dairy"],
  cuisines: ["Italian"],
  maxMinutes: 30,
  minRating: null,
  cursor: null,
};

describe("recipe search API", () => {
  it("ranks candidates and returns the page, using only candidate criteria for the database", async () => {
    const repository = new TestRecipeSearchRepository([
      { id: "b", matched: 1, missing: 2, minutes: 20, ratingAverage: null },
      { id: "a", matched: 1, missing: 0, minutes: 25, ratingAverage: null },
      { id: "slow", matched: 1, missing: 0, minutes: 90, ratingAverage: null },
    ]);
    const app = createApiApp(new TestIngredientRepository(), 100, repository);

    const response = await request(app).post("/api/recipes/search").send(validRequest).expect(200);

    expect(response.body.totalCount).toBe(2);
    expect(response.body.nextCursor).toBeNull();
    expect(response.body.recipes.map((recipe: { id: string }) => recipe.id)).toEqual(["a", "b"]);
    expect(response.body.recipes[0]).toMatchObject({ matchedIngredients: ["chicken"], missingIngredients: ["salt"] });
    expect(repository.requests).toEqual([
      { included: ["chicken"], excluded: ["butter"], excludedCategories: ["dairy"], cuisines: ["Italian"] },
    ]);
  });

  it("returns an explicit client error when no ingredient is included", async () => {
    const repository = new TestRecipeSearchRepository();
    const app = createApiApp(new TestIngredientRepository(), 100, repository);

    await request(app)
      .post("/api/recipes/search")
      .send({ included: [], excluded: ["butter"] })
      .expect(400)
      .expect({ error: { code: "INGREDIENTS_REQUIRED", message: "Add at least one ingredient to search." } });
    expect(repository.requests).toEqual([]);
  });

  it("defaults the optional time limit, rating and cursor", async () => {
    const repository = new TestRecipeSearchRepository();
    const app = createApiApp(new TestIngredientRepository(), 100, repository);

    await request(app)
      .post("/api/recipes/search")
      .send({ included: ["chicken"], excluded: [] })
      .expect(200)
      .expect({ recipes: [], totalCount: 0, nextCursor: null });
  });

  it.each([
    { ...validRequest, included: ["", "chicken"] },
    { ...validRequest, included: ["chicken", "chicken"] },
    { ...validRequest, excludedCategories: ["dairy", "dairy"] },
    { ...validRequest, excludedCategories: ["vegetarian"] },
    { ...validRequest, cuisines: ["Italian", "Italian"] },
    { ...validRequest, cuisines: [""] },
    { ...validRequest, maxMinutes: 20 },
    { ...validRequest, minRating: 5 },
    { ...validRequest, minRating: 0 },
    { ...validRequest, cursor: "x".repeat(4097) },
    { ...validRequest, unexpected: true },
  ])("rejects invalid search criteria", async (body) => {
    const app = createApiApp(
      new TestIngredientRepository(),
      100,
      new TestRecipeSearchRepository(),
    );

    await request(app)
      .post("/api/recipes/search")
      .send(body)
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe("INVALID_REQUEST");
      });
  });

  it("rejects a cuisine that is not available in the graph", async () => {
    const app = createApiApp(
      new TestIngredientRepository(),
      100,
      new TestRecipeSearchRepository(),
    );

    await request(app)
      .post("/api/recipes/search")
      .send({ ...validRequest, cuisines: ["Atlantis"] })
      .expect(400)
      .expect({
        error: {
          code: "INVALID_REQUEST",
          message: "Cuisine selections must match available recipe cuisines.",
        },
      });
  });
  it("returns a client error for an invalid or mismatched cursor", async () => {
    const app = createApiApp(new TestIngredientRepository(), 100, new TestRecipeSearchRepository());

    await request(app)
      .post("/api/recipes/search")
      .send({ ...validRequest, cursor: "invalid" })
      .expect(400)
      .expect({
        error: {
          code: "INVALID_CURSOR",
          message: "The recipe search cursor is invalid or does not match these criteria.",
        },
      });
  });

  it("reports graph failures as explicit service errors", async () => {
    const graphError = new Error("connection refused");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApiApp(
      new TestIngredientRepository(),
      100,
      new TestRecipeSearchRepository([], graphError),
    );

    try {
      await request(app)
        .post("/api/recipes/search")
        .send(validRequest)
        .expect(503)
        .expect({
          error: {
            code: "GRAPH_UNAVAILABLE",
            message: "Recipe data is temporarily unavailable.",
          },
        });
      expect(consoleError).toHaveBeenCalledWith(
        "Recipe data is temporarily unavailable.",
        graphError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
