import express from "express";
import { rateLimit } from "express-rate-limit";

import { IngredientService } from "./features/ingredients/application/ingredient-service.js";
import type { IngredientRepository } from "./features/ingredients/ports/ingredient-repository.js";
import { RecipeService } from "./features/recipes/application/recipe-service.js";
import type { RecipeSearchRepository } from "./features/recipes/ports/recipe-search-repository.js";
import { apiErrorHandler } from "./http/api-error.js";
import { createApiRouter } from "./http/api-router.js";

export function createApiApp(
  ingredientRepository: IngredientRepository,
  rateLimitMax = 100,
  recipeSearchRepository?: RecipeSearchRepository,
) {
  const app = express();
  const ingredientService = new IngredientService(ingredientRepository);
  const recipeService = new RecipeService(recipeSearchRepository);

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: rateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_request, response) => {
        response.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Try again later.",
          },
        });
      },
    }),
  );
  app.use("/api", createApiRouter(ingredientService, recipeService));
  app.use(apiErrorHandler);

  return app;
}
