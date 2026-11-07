import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import {
  createApiApp,
} from "../api/src/app.js";
import type {
  IngredientAlias,
  IngredientsRepository,
} from "../api/src/core/ingredients/ingredients.repository.js";
import type { RecipeSearchPage } from "../api/src/core/recipes/recipes.types.js";
import type { RecipesRepository } from "../api/src/core/recipes/recipes.repository.js";

const invalidRequests: { description: string; body: Record<string, unknown> | undefined }[] = [
  { body: undefined, description: "missing text" },
  { body: { text: 10 }, description: "non-string text" },
  { body: { text: "chicken", unexpected: true }, description: "unknown fields" },
  { body: { text: "x".repeat(2001) }, description: "text above the limit" },
];

class TestIngredientRepository implements IngredientsRepository {
  constructor(
    private readonly names: readonly string[],
    private readonly failure?: Error,
    private readonly aliases: readonly IngredientAlias[] = [],
  ) {}

  async getIngredientNames() {
    if (this.failure) throw this.failure;
    return this.names;
  }

  async getIngredientAliases() {
    if (this.failure) throw this.failure;
    return this.aliases;
  }

  async getIngredientCategories() {
    if (this.failure) throw this.failure;
    return ["dairy", "fish/seafood", "meat", "nuts"];
  }
}

class TestRecipeSearchRepository implements RecipesRepository {
  async getCuisineNames() {
    return ["Italian", "Mexican"];
  }

  async getRecipeDetail() {
    return null;
  }

  async search(): Promise<RecipeSearchPage> {
    return { recipes: [], totalCount: 0, nextCursor: null };
  }
}

describe("ingredient API", () => {
  it("returns vocabulary from the test graph", async () => {
    const app = createApiApp(
      new TestIngredientRepository(
        ["green onion"],
        undefined,
        [{ alias: "scallion", canonicalName: "green onion" }],
      ),
    );

    await request(app)
      .get("/api/ingredients")
      .expect(200)
      .expect({ ingredients: ["green onion"] });
  });

  it("returns filter options from the test graph", async () => {
    const app = createApiApp(
      new TestIngredientRepository(["green onion"]),
      100,
      new TestRecipeSearchRepository(),
    );

    await request(app)
      .get("/api/filters")
      .expect(200)
      .expect({
        categories: ["dairy", "fish/seafood", "meat", "nuts"],
        cuisines: ["Italian", "Mexican"],
      });
  });

  it("parses a request against the test graph vocabulary", async () => {
    const app = createApiApp(new TestIngredientRepository(["butter", "chicken", "rice"]));

    await request(app)
      .post("/api/ingredients/parse")
      .send({ text: "chicken and rice, no butter" })
      .expect(200)
      .expect({
        included: ["chicken", "rice"],
        excluded: ["butter"],
        excludedCategories: [],
        unrecognized: [],
      });
  });

  it("parses supported broad exclusions as category criteria", async () => {
    const app = createApiApp(new TestIngredientRepository(["chicken"]));

    await request(app)
      .post("/api/ingredients/parse")
      .send({ text: "chicken, no dairy" })
      .expect(200)
      .expect({
        included: ["chicken"],
        excluded: [],
        excludedCategories: ["dairy"],
        unrecognized: [],
      });
  });

  it("resolves aliases and typos while preserving natural-language exclusions", async () => {
    const app = createApiApp(
      new TestIngredientRepository(
        ["butter", "chicken", "green onion"],
        undefined,
        [{ alias: "scallion", canonicalName: "green onion" }],
      ),
    );

    await request(app)
      .post("/api/ingredients/parse")
      .send({ text: "I don't have scallion and chiken, dragonfruit" })
      .expect(200)
      .expect({
        included: ["chicken"],
        excluded: ["green onion"],
        excludedCategories: [],
        unrecognized: ["dragonfruit"],
      });
  });

  it.each(invalidRequests)("rejects $description", async ({ body }) => {
    const app = createApiApp(new TestIngredientRepository(["chicken"]));

    await request(app)
      .post("/api/ingredients/parse")
      .send(body)
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe("INVALID_REQUEST");
      });
  });

  it("returns a client error for malformed JSON", async () => {
    const app = createApiApp(new TestIngredientRepository(["chicken"]));

    await request(app)
      .post("/api/ingredients/parse")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400)
      .expect({
        error: {
          code: "INVALID_JSON",
          message: "Request body must contain valid JSON.",
        },
      });
  });

  it("returns an explicit service error when the graph is unavailable", async () => {
    const error = new Error("connection refused");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApiApp(new TestIngredientRepository([], error));

    try {
      await request(app)
        .get("/api/ingredients")
        .expect(503)
        .expect({
          error: {
            code: "GRAPH_UNAVAILABLE",
            message: "Ingredient data is temporarily unavailable.",
          },
        });
      expect(consoleError).toHaveBeenCalledWith(
        "Ingredient data is temporarily unavailable.",
        error,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("limits API requests", async () => {
    const app = createApiApp(new TestIngredientRepository(["chicken"]), 1);
    await request(app).get("/api/ingredients").expect(200);
    await request(app)
      .get("/api/ingredients")
      .expect(429)
      .expect({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again later.",
        },
      });
  });
});
