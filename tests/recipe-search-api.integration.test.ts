import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApiApp } from "../api/src/app.js";
import { InvalidRecipeSearchCursorError } from "../api/src/features/recipes/recipe-search-cursor.js";
import type {
  RecipeSearchCriteria,
  RecipeSearchPage,
  RecipeSearchRepository,
} from "../api/src/features/recipes/recipe-search-types.js";
import type { IngredientRepository } from "../api/src/features/ingredients/ingredient-repository.js";

class TestIngredientRepository implements IngredientRepository {
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

class TestRecipeSearchRepository implements RecipeSearchRepository {
  readonly requests: RecipeSearchCriteria[] = [];

  constructor(
    private readonly page: RecipeSearchPage = {
      recipes: [],
      totalCount: 0,
      nextCursor: null,
    },
    private readonly failure?: Error,
  ) {}

  async getCuisineNames() {
    return ["Italian", "Mexican"];
  }

  async search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage> {
    this.requests.push(criteria);
    if (this.failure) throw this.failure;
    return this.page;
  }
}

const validRequest = {
  included: ["chicken"],
  excluded: ["butter"],
  excludedCategories: ["dairy"],
  cuisines: ["Italian"],
  maxMinutes: 30,
  cursor: null,
};

describe("recipe search API", () => {
  it("passes validated criteria to the repository and returns its page", async () => {
    const page: RecipeSearchPage = {
      recipes: [
        {
          id: "1",
          name: "Chicken",
          minutes: 20,
          matchedIngredients: ["chicken"],
          missingIngredients: [],
          excludedIngredients: [],
        },
      ],
      totalCount: 1,
      nextCursor: "next-page",
    };
    const repository = new TestRecipeSearchRepository(page);
    const app = createApiApp(new TestIngredientRepository(), 100, repository);

    await request(app)
      .post("/api/recipes/search")
      .send(validRequest)
      .expect(200)
      .expect(page);

    expect(repository.requests).toEqual([validRequest]);
  });

  it("defaults the optional time limit and cursor", async () => {
    const repository = new TestRecipeSearchRepository();
    const app = createApiApp(new TestIngredientRepository(), 100, repository);

    await request(app)
      .post("/api/recipes/search")
      .send({ included: [], excluded: [] })
      .expect(200);

    expect(repository.requests).toEqual([
      {
        included: [],
        excluded: [],
        excludedCategories: [],
        cuisines: [],
        maxMinutes: null,
        cursor: null,
      },
    ]);
  });

  it.each([
    { ...validRequest, included: ["", "chicken"] },
    { ...validRequest, included: ["chicken", "chicken"] },
    { ...validRequest, excludedCategories: ["dairy", "dairy"] },
    { ...validRequest, excludedCategories: ["vegetarian"] },
    { ...validRequest, cuisines: ["Italian", "Italian"] },
    { ...validRequest, cuisines: [""] },
    { ...validRequest, maxMinutes: 20 },
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
    const repository = new TestRecipeSearchRepository(
      { recipes: [], totalCount: 0, nextCursor: null },
      new InvalidRecipeSearchCursorError(),
    );
    const app = createApiApp(new TestIngredientRepository(), 100, repository);

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
      new TestRecipeSearchRepository(undefined, graphError),
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
