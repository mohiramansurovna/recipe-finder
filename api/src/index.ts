import "dotenv/config";

import neo4j from "neo4j-driver";
import { z } from "zod";

import { createApiApp } from "./app.js";
import { Neo4jIngredientsRepository } from "./infrastructure/neo4j/repositories/ingredients.neo4j.repository.js";
import { Neo4jRecipesRepository } from "./infrastructure/neo4j/repositories/recipes.neo4j.repository.js";
import { Neo4jAccountsRepository } from "./infrastructure/neo4j/repositories/accounts.neo4j.repository.js";
import { Argon2PasswordHasher } from "./infrastructure/accounts/argon2-password-hasher.js";
import { ResendVerificationMailer } from "./infrastructure/accounts/resend-verification-mailer.js";
import { AccountsService } from "./application/services/accounts.service.js";

const environmentSchema = z.object({
  NEO4J_URI: z.string().min(1).default("bolt://localhost:7687"),
  NEO4J_USER: z.string().min(1).default("neo4j"),
  NEO4J_PASSWORD: z.string().min(1),
  NEO4J_DATABASE: z.string().default("neo4j"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  RESEND_API_KEY: z.string().trim().min(1),
  VERIFICATION_CODE_SECRET: z.string().min(32),
  EMAIL_FROM: z.string().email(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

async function main() {
  const environment = environmentSchema.parse(process.env);
  const driver = neo4j.driver(
    environment.NEO4J_URI,
    neo4j.auth.basic(environment.NEO4J_USER, environment.NEO4J_PASSWORD),
  );
  const ingredientRepository = new Neo4jIngredientsRepository(
    driver,
    environment.NEO4J_DATABASE,
  );
  const recipeSearchRepository = new Neo4jRecipesRepository(
    driver,
    environment.NEO4J_DATABASE,
  );
  const accountsRepository = new Neo4jAccountsRepository(
    driver,
    environment.NEO4J_DATABASE,
  );
  const accountsService = new AccountsService({
    repository: accountsRepository,
    passwordHasher: new Argon2PasswordHasher(),
    mailer: new ResendVerificationMailer(environment.RESEND_API_KEY, environment.EMAIL_FROM),
    verificationSecret: environment.VERIFICATION_CODE_SECRET,
    onResendDeliveryFailure: (challengeId, error) => {
      console.error("Verification email delivery failed.", {
        challengeId,
        reason: error instanceof Error ? error.message : "Unknown delivery error",
      });
    },
  });
  try {
    await accountsRepository.assertReady();
  } catch (error) {
    await driver.close();
    throw error;
  }
  const app = createApiApp(
    ingredientRepository,
    100,
    recipeSearchRepository,
    accountsService,
    () => accountsRepository.assertReady(),
    environment.TRUST_PROXY_HOPS,
  );
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
