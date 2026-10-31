import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";

import { importPreparedData } from "../scripts/import-data.js";

const preparedFixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "prepared",
);
const testConfig =
  process.env["NEO4J_TEST_URI"] !== undefined &&
  process.env["NEO4J_TEST_USER"] !== undefined &&
  process.env["NEO4J_TEST_PASSWORD"] !== undefined
    ? {
        uri: process.env["NEO4J_TEST_URI"],
        username: process.env["NEO4J_TEST_USER"],
        password: process.env["NEO4J_TEST_PASSWORD"],
        database: process.env["NEO4J_TEST_DATABASE"] || "neo4j",
      }
    : undefined;

describe.skipIf(testConfig === undefined)("Neo4j importer integration", () => {
  it("imports fixture data and rejects a second import into the non-empty database", async () => {
    if (testConfig === undefined) {
      throw new Error("Neo4j integration test configuration is missing.");
    }
    const driver = neo4j.driver(
      testConfig.uri,
      neo4j.auth.basic(testConfig.username, testConfig.password),
    );

    try {
      await expect(
        importPreparedData(preparedFixtureDirectory, testConfig),
      ).resolves.toEqual({ recipes: 2, ingredients: 2, uses: 2 });

      const session = driver.session({ database: testConfig.database });
      try {
        const result = await session.run(
          `MATCH (recipe:Recipe)
           WITH count(recipe) AS recipeCount,
                sum(CASE WHEN recipe.minutes IS NULL THEN 1 ELSE 0 END) AS nullMinutes
           MATCH (ingredient:Ingredient)
           WITH recipeCount, nullMinutes, count(ingredient) AS ingredientCount
           MATCH (:Recipe)-[use:USES]->(:Ingredient)
           RETURN recipeCount, ingredientCount, nullMinutes, count(use) AS useCount`,
        );
        const record = result.records[0];
        if (record === undefined) {
          throw new Error("Neo4j integration query returned no result.");
        }
        const integer = (field: string): number => {
          const value: unknown = record.get(field);
          if (!neo4j.isInt(value)) {
            throw new Error(`Neo4j integration query returned invalid ${field}.`);
          }
          return value.toNumber();
        };
        expect({
          recipes: integer("recipeCount"),
          ingredients: integer("ingredientCount"),
          recipesWithoutMinutes: integer("nullMinutes"),
          uses: integer("useCount"),
        }).toEqual({
          recipes: 2,
          ingredients: 2,
          recipesWithoutMinutes: 1,
          uses: 2,
        });
      } finally {
        await session.close();
      }

      await expect(
        importPreparedData(preparedFixtureDirectory, testConfig),
      ).rejects.toThrow("requires a fresh database");
    } finally {
      await driver.close();
    }
  }, 30_000);
});
