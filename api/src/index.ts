import "dotenv/config";

import neo4j from "neo4j-driver";
import { z } from "zod";

import { createApiApp } from "./app.js";
import { Neo4jIngredientRepository } from "./features/ingredients/neo4j-ingredient-repository.js";
import { Neo4jRecipeSearchRepository } from "./features/recipes/neo4j-recipe-search-repository.js";

const environmentSchema = z.object({
  NEO4J_URI: z.string().min(1).default("bolt://localhost:7687"),
  NEO4J_USER: z.string().min(1).default("neo4j"),
  NEO4J_PASSWORD: z.string().min(1),
  NEO4J_DATABASE: z.string().default("neo4j"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

async function main() {
  const environment = environmentSchema.parse(process.env);
  const driver = neo4j.driver(
    environment.NEO4J_URI,
    neo4j.auth.basic(environment.NEO4J_USER, environment.NEO4J_PASSWORD),
  );
  const ingredientRepository = new Neo4jIngredientRepository(
    driver,
    environment.NEO4J_DATABASE,
  );
  const recipeSearchRepository = new Neo4jRecipeSearchRepository(
    driver,
    environment.NEO4J_DATABASE,
  );
  const app = createApiApp(ingredientRepository, 100, recipeSearchRepository);
  const server = app.listen(environment.API_PORT, "0.0.0.0", () => {
    console.log(`Recipe Graph API listening on port ${environment.API_PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      void driver.close();
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error("Recipe Graph API failed to start:", error);
  process.exitCode = 1;
});
