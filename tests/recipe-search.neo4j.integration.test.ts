import { randomUUID } from "node:crypto";
import neo4j from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApiApp } from "../api/src/app.js";
import { RecipesService } from "../api/src/application/services/recipes.service.js";
import { REFRESH_ALL_RATINGS_QUERY } from "../api/src/infrastructure/neo4j/rating-averages.js";
import { Neo4jIngredientsRepository } from "../api/src/infrastructure/neo4j/repositories/ingredients.neo4j.repository.js";
import { Neo4jRecipesRepository } from "../api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.js";

const testConfig =
  process.env["NEO4J_SEARCH_TEST_URI"] !== undefined &&
  process.env["NEO4J_SEARCH_TEST_USER"] !== undefined &&
  process.env["NEO4J_SEARCH_TEST_PASSWORD"] !== undefined
    ? {
        uri: process.env["NEO4J_SEARCH_TEST_URI"],
        username: process.env["NEO4J_SEARCH_TEST_USER"],
        password: process.env["NEO4J_SEARCH_TEST_PASSWORD"],
        database: process.env["NEO4J_SEARCH_TEST_DATABASE"] || "neo4j",
      }
    : undefined;

describe.skipIf(testConfig === undefined)("Neo4j recipe search integration", () => {
  it("ranks recipes, filters known cooking times, and traverses isolated cursor pages", async () => {
    if (testConfig === undefined) {
      throw new Error("Set NEO4J_SEARCH_TEST_URI, NEO4J_SEARCH_TEST_USER, and NEO4J_SEARCH_TEST_PASSWORD.");
    }

    const driver: Driver = neo4j.driver(
      testConfig.uri,
      neo4j.auth.basic(testConfig.username, testConfig.password),
    );
    const prefix = `search-test-${randomUUID().replaceAll("-", "")}`;
    const database = testConfig.database;
    let dataSeeded = false;

    try {
      const seedRecipes = [
        { id: `${prefix}-rank-01`, name: "Best fit", minutes: 15 },
        { id: `${prefix}-rank-02`, name: "Excluded match", minutes: 20 },
        { id: `${prefix}-rank-03`, name: "Fewer matches", minutes: 15 },
        { id: `${prefix}-rank-04`, name: "One missing", minutes: 15, aggregateRating: 4.2 },
        { id: `${prefix}-rank-05`, name: "Unknown time", minutes: null },
        { id: `${prefix}-alias-search`, name: "Canonical alias match", minutes: 18 },
        { id: `${prefix}-seafood`, name: "Seafood recipe", minutes: 12 },
        ...Array.from({ length: 25 }, (_, index) => ({
          id: `${prefix}-page-${String(index).padStart(3, "0")}`,
          name: `Page recipe ${index}`,
          minutes: null,
        })),
      ];
      const seedIngredients = [
        "chicken",
        "rice",
        "butter",
        "tomato",
        "green onion",
        "scallion",
        "salmon",
        ...Array.from({ length: 25 }, (_, index) => `page ingredient ${index}`),
      ].map((name) => `${prefix}-${name}`);
      const seedUses = [
        { id: `${prefix}-rank-01`, ingredient: "chicken" },
        { id: `${prefix}-rank-01`, ingredient: "rice" },
        { id: `${prefix}-rank-02`, ingredient: "chicken" },
        { id: `${prefix}-rank-02`, ingredient: "rice" },
        { id: `${prefix}-rank-02`, ingredient: "butter" },
        { id: `${prefix}-rank-03`, ingredient: "chicken" },
        { id: `${prefix}-rank-03`, ingredient: "butter" },
        { id: `${prefix}-rank-04`, ingredient: "chicken" },
        { id: `${prefix}-rank-04`, ingredient: "tomato" },
        { id: `${prefix}-rank-04`, ingredient: "butter" },
        { id: `${prefix}-rank-05`, ingredient: "chicken" },
        { id: `${prefix}-alias-search`, ingredient: "chicken" },
        { id: `${prefix}-alias-search`, ingredient: "green onion" },
        { id: `${prefix}-alias-search`, ingredient: "butter" },
        { id: `${prefix}-seafood`, ingredient: "salmon" },
        ...Array.from({ length: 25 }, (_, index) => ({
          id: `${prefix}-page-${String(index).padStart(3, "0")}`,
          ingredient: `page ingredient ${index}`,
        })),
      ].map((use) => ({ ...use, id: use.id, ingredient: `${prefix}-${use.ingredient}` }));
      const seedSession = driver.session({ database });
      try {
        const existing = await seedSession.run("MATCH (node) RETURN count(node) AS count");
        const countValue: unknown = existing.records[0]?.get("count");
        const nodeCount = neo4j.isInt(countValue) ? countValue.toNumber() : countValue;
        if (nodeCount !== 0) {
          throw new Error(
            "The Neo4j search integration test requires an empty dedicated test database; refusing to write to a non-empty graph.",
          );
        }

        dataSeeded = true;
        await seedSession.run(
          `UNWIND $recipes AS row
           CREATE (recipe:Recipe {id: row.id, name: row.name})
           SET recipe.minutes = row.minutes, recipe.aggregateRating = row.aggregateRating`,
          { recipes: seedRecipes },
        );
        await seedSession.run(
          `UNWIND $names AS name
           CREATE (:Ingredient {name: name})`,
          { names: seedIngredients },
        );
        await seedSession.run(
          `UNWIND $uses AS row
           MATCH (recipe:Recipe {id: row.id})
           MATCH (ingredient:Ingredient {name: row.ingredient})
           CREATE (recipe)-[:USES]->(ingredient)`,
          { uses: seedUses },
        );
        await seedSession.run(
          `MATCH (alias:Ingredient {name: $alias})
           MATCH (canonical:Ingredient {name: $canonical})
           MERGE (alias)-[:ALIAS_OF]->(canonical)`,
          {
            alias: `${prefix}-scallion`,
            canonical: `${prefix}-green onion`,
          },
        );
        await seedSession.run(
          `UNWIND $categories AS name
           CREATE (:IngredientCategory {name: name, testRun: $testRun})`,
          {
            categories: ["dairy", "fish/seafood", "meat", "nuts"],
            testRun: prefix,
          },
        );
        await seedSession.run(
          `UNWIND $links AS row
           MATCH (ingredient:Ingredient {name: row.ingredient})
           MATCH (category:IngredientCategory {name: row.category})
           CREATE (ingredient)-[:IN_CATEGORY]->(category)`,
          {
            links: [
              { ingredient: `${prefix}-chicken`, category: "meat" },
              { ingredient: `${prefix}-butter`, category: "dairy" },
              { ingredient: `${prefix}-salmon`, category: "fish/seafood" },
            ],
          },
        );
        await seedSession.run(
          `UNWIND $cuisines AS name
           CREATE (:Cuisine {name: name, testRun: $testRun})`,
          { cuisines: ["Italian", "Mexican"], testRun: prefix },
        );
        await seedSession.run(
          `UNWIND $links AS row
           MATCH (recipe:Recipe {id: row.recipe})
           MATCH (cuisine:Cuisine {name: row.cuisine})
           CREATE (recipe)-[:IN_CUISINE]->(cuisine)`,
          {
            links: [
              { recipe: `${prefix}-rank-01`, cuisine: "Italian" },
              { recipe: `${prefix}-rank-02`, cuisine: "Mexican" },
              { recipe: `${prefix}-seafood`, cuisine: "Italian" },
            ],
          },
        );
        await seedSession.run(
          `UNWIND $ratings AS row
           MATCH (recipe:Recipe {id: row.recipe})
           CREATE (recipe)-[:HAS_RATING]->(:Rating {value: row.value})`,
          {
            ratings: [
              { recipe: `${prefix}-rank-01`, value: 5 },
              { recipe: `${prefix}-rank-01`, value: 4 },
              { recipe: `${prefix}-rank-02`, value: 3 },
              { recipe: `${prefix}-rank-03`, value: 2 },
            ],
          },
        );
        await seedSession.run(REFRESH_ALL_RATINGS_QUERY);
        await seedSession.run(
          `CREATE (:RecipeGraphMetadata {key: 'recipe-import', completed: true,
                   completedAt: datetime(), ratingFieldsReady: true})`,
        );
      } finally {
        await seedSession.close();
      }

      const repository = new Neo4jRecipesRepository(driver, database);
      const service = new RecipesService(repository);
      const app = createApiApp(
        new Neo4jIngredientsRepository(driver, database),
        100,
        repository,
      );
      await request(app)
        .get("/api/filters")
        .expect(200)
        .expect({
          categories: ["dairy", "fish/seafood", "meat", "nuts"],
          cuisines: ["Italian", "Mexican"],
        });
      const parsedCriteria = {
        included: [`${prefix}-green onion`, `${prefix}-chicken`],
        excluded: [`${prefix}-butter`],
      };
      await request(app)
        .post("/api/ingredients/parse")
        .send({
          text: `${prefix}-scallion, ${prefix}-chickan, I don't have ${prefix}-butter`,
        })
        .expect(200)
        .expect({
          ...parsedCriteria,
          excludedCategories: [],
          unrecognized: [],
        });
      await request(app)
        .post("/api/recipes/search")
        .send({ ...parsedCriteria, maxMinutes: null, cursor: null })
        .expect(200)
        .expect((response) => {
          const ids = response.body.recipes.map((recipe: { id: string }) => recipe.id);
          expect(ids).not.toContain(`${prefix}-alias-search`); // uses an excluded ingredient
          expect(ids).toContain(`${prefix}-rank-05`);
        });
      await request(app)
        .post("/api/recipes/search")
        .send({ included: [], excluded: [`${prefix}-butter`] })
        .expect(400)
        .expect((response) => {
          expect(response.body.error.code).toBe("INGREDIENTS_REQUIRED");
        });

      const search = (change: Record<string, unknown>) =>
        service.search({
          included: [`${prefix}-chicken`, `${prefix}-rice`],
          excluded: [],
          excludedCategories: [],
          cuisines: [],
          maxMinutes: null,
          minRating: null,
          cursor: null,
          ...change,
        });
      const ids = (page: { recipes: { id: string }[] }) => page.recipes.map((recipe) => recipe.id);
      const id = (name: string) => `${prefix}-${name}`;

      // Most matched first, then fewest missing, then id; recipes sharing nothing are absent.
      const ranked = await search({});
      expect(ids(ranked)).toEqual([
        id("rank-01"),
        id("rank-02"),
        id("rank-05"),
        id("rank-03"),
        id("alias-search"),
        id("rank-04"),
      ]);
      expect(ranked.totalCount).toBe(6);
      expect(ranked.nextCursor).toBeNull();

      // Excluded ingredients hide recipes.
      const excluded = await search({ excluded: [`${prefix}-butter`] });
      expect(ids(excluded)).toEqual([id("rank-01"), id("rank-05")]);
      expect(excluded.totalCount).toBe(2);

      // Excluded categories hide recipes.
      expect(ids(await search({ excludedCategories: ["dairy"] }))).toEqual([id("rank-01"), id("rank-05")]);

      // Time filter hides slower recipes and recipes with no time.
      const quick = await search({ maxMinutes: 15 });
      expect(ids(quick)).toEqual([id("rank-01"), id("rank-03"), id("rank-04")]);
      expect(quick.totalCount).toBe(3);
      expect((await search({ maxMinutes: 0 })).totalCount).toBe(0);

      // Rating filter: individual average, dataset fallback, unrated hidden, order unchanged.
      expect(ids(await search({ minRating: 4 }))).toEqual([id("rank-01"), id("rank-04")]);
      expect(ids(await search({ minRating: 3 }))).toEqual([id("rank-01"), id("rank-02"), id("rank-04")]);

      // Cuisine filter uses OR semantics across selections.
      expect(ids(await search({ included: [`${prefix}-chicken`, `${prefix}-salmon`], cuisines: ["Italian"] }))).toEqual([
        id("seafood"),
        id("rank-01"),
      ]);
      expect(ids(await search({ cuisines: ["Mexican"] }))).toEqual([id("rank-02")]);

      expect(await repository.getCuisineNames()).toEqual(["Italian", "Mexican"]);

      // Cursor pages cover every candidate exactly once.
      const pageSearch = (cursor: string | null) =>
        search({
          included: Array.from({ length: 25 }, (_, index) => `${prefix}-page ingredient ${index}`),
          cursor,
        });
      const firstPage = await pageSearch(null);
      expect(firstPage.recipes).toHaveLength(20);
      expect(firstPage.totalCount).toBe(25);
      expect(firstPage.nextCursor).not.toBeNull();
      const secondPage = await pageSearch(firstPage.nextCursor);
      expect([...ids(firstPage), ...ids(secondPage)]).toEqual(
        Array.from({ length: 25 }, (_, index) => id(`page-${String(index).padStart(3, "0")}`)),
      );
      expect(secondPage.nextCursor).toBeNull();
    } finally {
      if (dataSeeded) {
        const cleanupSession = driver.session({ database });
        try {
          await cleanupSession.run(
            `MATCH (node)
             WHERE (node:Recipe AND node.id STARTS WITH $prefix)
                OR (node:Ingredient AND node.name STARTS WITH $prefix)
                OR ((node:IngredientCategory OR node:Cuisine) AND node.testRun = $testRun)
                OR node:Rating OR node:RecipeGraphMetadata
             DETACH DELETE node`,
            { prefix: `${prefix}-`, testRun: prefix },
          );
        } finally {
          await cleanupSession.close();
        }
      }
      await driver.close();
    }
  }, 60_000);
});
