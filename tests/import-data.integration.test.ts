import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";

import { Neo4jIngredientsRepository } from "../api/src/infrastructure/neo4j/repositories/ingredients.neo4j.repository.js";
import { Neo4jRecipesRepository } from "../api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.js";
import { Neo4jAccountsRepository } from "../api/src/infrastructure/neo4j/repositories/accounts.neo4j.repository.js";
import { assertAccountSchemaReady, migrateAccountSchema } from "../api/src/infrastructure/neo4j/account-schema.js";
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
      await expect(migrateAccountSchema(driver, testConfig.database)).rejects.toThrow(
        "Recipe import is incomplete",
      );
      await expect(
        importPreparedData(preparedFixtureDirectory, testConfig),
      ).resolves.toEqual({
        recipes: 2,
        ingredients: 3,
        uses: 3,
        ratings: 1,
        aliases: 1,
        ingredientCategories: 1,
        recipeCuisines: 2,
      });

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
          ingredients: 4,
          recipesWithoutMinutes: 1,
          uses: 3,
        });
        await session.run("DROP CONSTRAINT recipe_id_unique");
        await expect(migrateAccountSchema(driver, testConfig.database)).rejects.toThrow(
          "Required recipe constraint is missing",
        );
        await session.run(
          "CREATE CONSTRAINT recipe_id_unique IF NOT EXISTS FOR (recipe:Recipe) REQUIRE recipe.id IS UNIQUE",
        );
        await migrateAccountSchema(driver, testConfig.database);
        await migrateAccountSchema(driver, testConfig.database);
        await expect(assertAccountSchemaReady(driver, testConfig.database)).resolves.toBeUndefined();

        const accountsRepository = new Neo4jAccountsRepository(driver, testConfig.database);
        const issuedAt = Date.now();
        const registration = {
          accountId: "test-account-1",
          challengeId: "test-challenge-1",
          email: "account@example.test",
          username: "test_account",
          passwordHash: "argon2id-test-hash",
          codeHash: "one-time-code-hash",
          codeExpiresAt: issuedAt + 24 * 60 * 60 * 1000,
          now: issuedAt,
          accountRateKey: "test-account-1",
          ipRateKey: "test-ip-hash",
        };
        await expect(accountsRepository.register(registration)).resolves.toBe("created");
        await expect(accountsRepository.register({
          ...registration,
          accountId: "test-account-2",
          challengeId: "test-challenge-2",
          username: "other_name",
        })).resolves.toBe("duplicate");
        const race = await Promise.all([
          accountsRepository.register({
            ...registration,
            accountId: "race-account-1",
            challengeId: "race-challenge-1",
            email: "race@example.test",
            username: "race_account",
            ipRateKey: "race-ip-1",
          }),
          accountsRepository.register({
            ...registration,
            accountId: "race-account-2",
            challengeId: "race-challenge-2",
            email: "race@example.test",
            username: "race_account",
            ipRateKey: "race-ip-2",
          }),
        ]);
        expect(race.sort()).toEqual(["created", "duplicate"]);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await expect(accountsRepository.verify({
            email: registration.email,
            codeHash: "incorrect-hash",
            now: issuedAt + attempt,
          })).resolves.toBe(false);
        }
        await expect(accountsRepository.verify({
          email: registration.email,
          codeHash: registration.codeHash,
          now: issuedAt + 10,
        })).resolves.toBe(false);
        const resentChallengeId = "test-challenge-resent";
        await expect(accountsRepository.resendVerification({
          challengeId: resentChallengeId,
          email: registration.email,
          codeHash: "replacement-code-hash",
          codeExpiresAt: issuedAt + 24 * 60 * 60 * 1000,
          now: issuedAt + 20,
          ipRateKey: "test-ip-hash",
        })).resolves.toBe("issued");
        await expect(accountsRepository.verify({
          email: registration.email,
          codeHash: registration.codeHash,
          now: issuedAt + 21,
        })).resolves.toBe(false);
        await expect(accountsRepository.verify({
          email: registration.email,
          codeHash: "replacement-code-hash",
          now: issuedAt + 22,
        })).resolves.toBe(true);
        await expect(accountsRepository.verify({
          email: registration.email,
          codeHash: "replacement-code-hash",
          now: issuedAt + 23,
        })).resolves.toBe(false);

        const expiring = {
          ...registration,
          accountId: "expiring-account",
          challengeId: "expiring-challenge",
          email: "expiring@example.test",
          username: "expiring_account",
          codeHash: "expiring-code-hash",
          codeExpiresAt: issuedAt + 30,
          accountRateKey: "expiring-account",
          ipRateKey: "expiring-ip",
        };
        await expect(accountsRepository.register(expiring)).resolves.toBe("created");
        await expect(accountsRepository.verify({
          email: expiring.email,
          codeHash: expiring.codeHash,
          now: expiring.codeExpiresAt,
        })).resolves.toBe(false);

        const limited = {
          ...registration,
          accountId: "limited-account",
          challengeId: "limited-challenge",
          email: "limited@example.test",
          username: "limited_account",
          accountRateKey: "limited-account",
          ipRateKey: "limited-ip-initial",
        };
        await expect(accountsRepository.register(limited)).resolves.toBe("created");
        for (let resend = 0; resend < 2; resend += 1) {
          await expect(accountsRepository.resendVerification({
            challengeId: `limited-resend-${resend}`,
            email: limited.email,
            codeHash: `limited-code-${resend}`,
            codeExpiresAt: issuedAt + 24 * 60 * 60 * 1000,
            now: issuedAt + 40 + resend,
            ipRateKey: `limited-ip-${resend}`,
          })).resolves.toBe("issued");
        }
        await expect(accountsRepository.resendVerification({
          challengeId: "limited-resend-3",
          email: limited.email,
          codeHash: "limited-code-3",
          codeExpiresAt: issuedAt + 24 * 60 * 60 * 1000,
          now: issuedAt + 43,
          ipRateKey: "limited-ip-3",
        })).resolves.toBe("rate-limited");

        const sharedIpRegistrations = await Promise.all(
          Array.from({ length: 11 }, (_, index) =>
            accountsRepository.register({
              ...registration,
              accountId: `shared-ip-account-${index}`,
              challengeId: `shared-ip-challenge-${index}`,
              email: `shared-ip-${index}@example.test`,
              username: `shared_ip_${index}`,
              accountRateKey: `shared-ip-account-${index}`,
              ipRateKey: "shared-ip-limit",
            }),
          ),
        );
        expect(sharedIpRegistrations.filter((result) => result === "created")).toHaveLength(10);
        expect(sharedIpRegistrations.filter((result) => result === "rate-limited")).toHaveLength(1);
        const classifications = await session.run(
          `MATCH (chicken:Ingredient {name: 'chicken'})-[:IN_CATEGORY]->(category:IngredientCategory)
           MATCH (recipe:Recipe {id: '2'})-[:IN_CUISINE]->(cuisine:Cuisine)
           RETURN category.name AS category, cuisine.name AS cuisine`,
        );
        expect(classifications.records.map((record) => [
          record.get("category"),
          record.get("cuisine"),
        ])).toEqual([["meat", "Mexican"]]);
        const aliases = await session.run(
          "MATCH (alias:Ingredient {name: 'peppercorn'})-[:ALIAS_OF]->(canonical:Ingredient) RETURN canonical.name AS name",
        );
        expect(aliases.records.map((record) => record.get("name"))).toEqual(["pepper"]);
        await session.run(
          `MATCH (alias:Ingredient {name: 'peppercorn'})
           MATCH (canonical:Ingredient {name: 'pepper'})
           MERGE (alias)-[:ALIAS_OF]->(canonical)`,
        );
        const relationshipCount = await session.run(
          "MATCH (:Ingredient {name: 'peppercorn'})-[alias:ALIAS_OF]->(:Ingredient {name: 'pepper'}) RETURN count(alias) AS count",
        );
        expect(relationshipCount.records[0]?.get("count")).toEqual(neo4j.int(1));
        const ingredientRepository = new Neo4jIngredientsRepository(
          driver,
          testConfig.database,
        );
        await expect(ingredientRepository.getIngredientNames()).resolves.toEqual([
          "chicken",
          "pepper",
          "salt",
        ]);
        await expect(ingredientRepository.getIngredientAliases()).resolves.toEqual([
          { alias: "peppercorn", canonicalName: "pepper" },
        ]);
        await expect(ingredientRepository.getIngredientCategories()).resolves.toEqual([
          "meat",
        ]);
        const recipeRepository = new Neo4jRecipesRepository(
          driver,
          testConfig.database,
        );
        await expect(recipeRepository.getCuisineNames()).resolves.toEqual([
          "Italian",
          "Mexican",
        ]);
        await expect(recipeRepository.getRecipeDetail("1")).resolves.toEqual({
          id: "1",
          name: "Soup",
          minutes: 10,
          instructions: ["Simmer.", "Serve."],
          ingredients: ["salt"],
          cuisines: ["Italian"],
          ratings: { individual: [5], aggregate: null },
        });
        await expect(recipeRepository.getRecipeDetail("2")).resolves.toMatchObject({
          id: "2",
          minutes: null,
          instructions: null,
          ratings: { individual: [], aggregate: null },
        });
        await expect(recipeRepository.getRecipeDetail("unknown")).resolves.toBeNull();
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
