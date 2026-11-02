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
      } finally {
        await seedSession.close();
      }

      const repository = new Neo4jRecipeSearchRepository(driver, database);
      const app = createApiApp(
        new Neo4jIngredientRepository(driver, database),
        100,
        repository,
      );
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
        maxMinutes: null,
        cursor: null,
      });
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
        maxMinutes: 15,
        cursor: null,
      });
      const limitedIds = limitedPage.recipes.map((recipe) => recipe.id);
      expect(limitedIds).toContain(`${prefix}-rank-01`);
      expect(limitedIds).not.toContain(`${prefix}-rank-02`);
      expect(limitedIds).not.toContain(`${prefix}-rank-05`);
      expect(
        limitedPage.recipes.find((recipe) => recipe.id === `${prefix}-rank-04`)
          ?.missingIngredients,
      ).toContain(`${prefix}-tomato`);

      const firstBrowsePage = await repository.search({
        included: [],
        excluded: [],
        maxMinutes: null,
        cursor: null,
      });
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
        maxMinutes: null,
        cursor: firstBrowsePage.nextCursor,
      });
      expect(secondBrowsePage.recipes.map((recipe) => recipe.id)).toEqual(
        Array.from(
          { length: 6 },
          (_, index) => `${prefix}-page-${String(index + 20).padStart(3, "0")}`,
        )
          .slice(0, 5)
          .concat(
            `${prefix}-rank-05`,
            `${prefix}-rank-01`,
            `${prefix}-rank-03`,
            `${prefix}-alias-search`,
            `${prefix}-rank-02`,
            `${prefix}-rank-04`,
          ),
      );
      expect(secondBrowsePage.nextCursor).toBeNull();
    } finally {
      if (dataSeeded) {
        const cleanupSession = driver.session({ database });
        try {
          await cleanupSession.run(
            `MATCH (node)
             WHERE (node:Recipe AND node.id STARTS WITH $prefix)
                OR (node:Ingredient AND node.name STARTS WITH $prefix)
             DETACH DELETE node`,
            { prefix: `${prefix}-` },
          );
        } finally {
          await cleanupSession.close();
        }
      }
      await driver.close();
    }
  }, 60_000);
});
