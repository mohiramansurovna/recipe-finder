import { randomUUID } from "node:crypto";
import neo4j from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApiApp } from "../api/src/app.js";
import { Neo4jIngredientRepository } from "../api/src/features/ingredients/neo4j-ingredient-repository.js";
import { Neo4jRecipeSearchRepository } from "../api/src/features/recipes/neo4j-recipe-search-repository.js";

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
        { id: `${prefix}-rank-04`, name: "One missing", minutes: 15 },
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
           SET recipe.minutes = row.minutes`,
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
      } finally {
        await seedSession.close();
      }

      const repository = new Neo4jRecipeSearchRepository(driver, database);
      const app = createApiApp(
        new Neo4jIngredientRepository(driver, database),
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
          expect(response.body.recipes).toContainEqual(
            expect.objectContaining({
              id: `${prefix}-alias-search`,
              matchedIngredients: parsedCriteria.included,
              excludedIngredients: parsedCriteria.excluded,
            }),
          );
        });

      const anyTimePage = await repository.search({
        included: [`${prefix}-chicken`, `${prefix}-rice`],
        excluded: [`${prefix}-butter`],
        excludedCategories: [],
        cuisines: [],
        maxMinutes: null,
        cursor: null,
      });
      expect(anyTimePage.totalCount).toBe(seedRecipes.length);
      const rankedIds = anyTimePage.recipes.map((recipe) => recipe.id);
      expect(rankedIds.slice(0, 4)).toEqual([
        `${prefix}-rank-01`,
        `${prefix}-rank-05`,
        `${prefix}-rank-02`,
        `${prefix}-rank-03`,
      ]);
      expect(rankedIds).toContain(`${prefix}-rank-05`);
      expect(
        anyTimePage.recipes.find((recipe) => recipe.id === `${prefix}-rank-02`)
          ?.excludedIngredients,
      ).toEqual([`${prefix}-butter`]);

      const limitedPage = await repository.search({
        included: [`${prefix}-chicken`, `${prefix}-rice`],
        excluded: [`${prefix}-butter`],
        excludedCategories: [],
        cuisines: [],
        maxMinutes: 15,
        cursor: null,
      });
      expect(limitedPage.totalCount).toBe(4);
      const limitedIds = limitedPage.recipes.map((recipe) => recipe.id);
      expect(limitedIds).toContain(`${prefix}-rank-01`);
      expect(limitedIds).not.toContain(`${prefix}-rank-02`);
      expect(limitedIds).not.toContain(`${prefix}-rank-05`);
      expect(
        limitedPage.recipes.find((recipe) => recipe.id === `${prefix}-rank-04`)
          ?.missingIngredients,
      ).toContain(`${prefix}-tomato`);

      const dairyExcluded = await repository.search({
        included: [`${prefix}-chicken`, `${prefix}-rice`],
        excluded: [],
        excludedCategories: ["dairy"],
        cuisines: [],
        maxMinutes: null,
        cursor: null,
      });
      expect(dairyExcluded.totalCount).toBe(seedRecipes.length - 3);
      const dairyExcludedIds = dairyExcluded.recipes.map((recipe) => recipe.id);
      expect(dairyExcludedIds).not.toContain(`${prefix}-rank-02`);
      expect(dairyExcludedIds).not.toContain(`${prefix}-alias-search`);
      expect(dairyExcludedIds).toContain(`${prefix}-rank-01`);

      const vegetarian = await repository.search({
        included: [],
        excluded: [],
        excludedCategories: ["meat", "fish/seafood"],
        cuisines: [],
        maxMinutes: null,
        cursor: null,
      });
      expect(vegetarian.totalCount).toBe(25);
      const vegetarianIds = vegetarian.recipes.map((recipe) => recipe.id);
      expect(vegetarianIds).not.toContain(`${prefix}-rank-01`);
      expect(vegetarianIds).not.toContain(`${prefix}-seafood`);
      expect(vegetarianIds).toContain(`${prefix}-page-000`);

      expect(await repository.getCuisineNames()).toEqual(["Italian", "Mexican"]);
      const selectedCuisines = await repository.search({
        included: [],
        excluded: [],
        excludedCategories: [],
        cuisines: ["Italian", "Mexican"],
        maxMinutes: null,
        cursor: null,
      });
      expect(selectedCuisines.totalCount).toBe(3);
      const selectedCuisineIds = new Set(
        selectedCuisines.recipes.map((recipe) => recipe.id),
      );
      expect(selectedCuisineIds).toEqual(
        new Set([
          `${prefix}-rank-01`,
          `${prefix}-rank-02`,
          `${prefix}-seafood`,
        ]),
      );

      const firstBrowsePage = await repository.search({
        included: [],
        excluded: [],
        excludedCategories: [],
        cuisines: [],
        maxMinutes: null,
        cursor: null,
      });
      expect(firstBrowsePage.totalCount).toBe(seedRecipes.length);
      expect(firstBrowsePage.recipes.map((recipe) => recipe.id)).toEqual(
        Array.from(
          { length: 20 },
          (_, index) => `${prefix}-page-${String(index).padStart(3, "0")}`,
        ),
      );
      expect(firstBrowsePage.nextCursor).not.toBeNull();

      const secondBrowsePage = await repository.search({
        included: [],
        excluded: [],
        excludedCategories: [],
        cuisines: [],
        maxMinutes: null,
        cursor: firstBrowsePage.nextCursor,
      });
      expect(secondBrowsePage.totalCount).toBe(firstBrowsePage.totalCount);
      expect(secondBrowsePage.recipes.map((recipe) => recipe.id)).toEqual(
        Array.from(
          { length: 6 },
          (_, index) => `${prefix}-page-${String(index + 20).padStart(3, "0")}`,
        )
          .slice(0, 5)
          .concat(
            `${prefix}-rank-05`,
            `${prefix}-seafood`,
            `${prefix}-rank-01`,
            `${prefix}-rank-03`,
            `${prefix}-alias-search`,
            `${prefix}-rank-02`,
            `${prefix}-rank-04`,
          ),
      );
      expect(secondBrowsePage.nextCursor).toBeNull();

      const emptyPage = await repository.search({
        included: [],
        excluded: [],
        excludedCategories: [],
        cuisines: [],
        maxMinutes: 0,
        cursor: null,
      });
      expect(emptyPage).toEqual({ recipes: [], totalCount: 0, nextCursor: null });
    } finally {
      if (dataSeeded) {
        const cleanupSession = driver.session({ database });
        try {
          await cleanupSession.run(
            `MATCH (node)
             WHERE (node:Recipe AND node.id STARTS WITH $prefix)
                OR (node:Ingredient AND node.name STARTS WITH $prefix)
                OR ((node:IngredientCategory OR node:Cuisine) AND node.testRun = $testRun)
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
