import { Router, type Request, type Response } from "express";
import { z } from "zod";

import type { IngredientService } from "../features/ingredients/application/ingredient-service.js";
import {
  InvalidRecipeCuisineError,
  RecipeService,
} from "../features/recipes/application/recipe-service.js";
import { InvalidRecipeSearchCursorError } from "../features/recipes/recipe-search-cursor.js";
import { ApiError, sendError } from "./api-error.js";

const parseRequestSchema = z.object({ text: z.string().max(2000) }).strict();
const ingredientCriteriaSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(100)
  .refine((ingredients) => new Set(ingredients).size === ingredients.length);
const categoryCriteriaSchema = z
  .array(z.enum(["dairy", "nuts", "meat", "fish/seafood"]))
  .max(4)
  .default([])
  .refine((categories) => new Set(categories).size === categories.length);
const cuisineCriteriaSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(50)
  .default([])
  .refine((cuisines) => new Set(cuisines).size === cuisines.length);
const recipeSearchRequestSchema = z
  .object({
    included: ingredientCriteriaSchema,
    excluded: ingredientCriteriaSchema,
    excludedCategories: categoryCriteriaSchema,
    cuisines: cuisineCriteriaSchema,
    maxMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).nullable().default(null),
    cursor: z.string().min(1).max(4096).nullable().default(null),
  })
  .strict();
const recipeDetailParamsSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export function createApiRouter(
  ingredientService: IngredientService,
  recipeService: RecipeService,
) {
  const router = Router();

  router.get("/ingredients", async (_request: Request, response: Response, next) => {
    try {
      response.json({ ingredients: await ingredientService.getIngredientNames() });
    } catch (error) {
      next(
        new ApiError(
          503,
          "GRAPH_UNAVAILABLE",
          "Ingredient data is temporarily unavailable.",
          { cause: error },
        ),
      );
    }
  });

  router.get("/filters", async (_request: Request, response: Response, next) => {
    if (!recipeService.isAvailable) {
      next(
        new ApiError(
          503,
          "SEARCH_UNAVAILABLE",
          "Recipe filters are temporarily unavailable.",
        ),
      );
      return;
    }
    try {
      const [categories, cuisines] = await Promise.all([
        ingredientService.getIngredientCategories(),
        recipeService.getCuisineNames(),
      ]);
      response.json({ categories, cuisines });
    } catch (error) {
      next(
        new ApiError(503, "GRAPH_UNAVAILABLE", "Recipe filters are temporarily unavailable.", {
          cause: error,
        }),
      );
    }
  });

  router.post("/ingredients/parse", async (request: Request, response: Response, next) => {
    const parsedRequest = parseRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendError(response, 400, "INVALID_REQUEST", "Provide a text field with at most 2000 characters.");
      return;
    }

    try {
      response.json(await ingredientService.parse(parsedRequest.data.text));
    } catch (error) {
      next(
        new ApiError(
          503,
          "GRAPH_UNAVAILABLE",
          "Ingredient data is temporarily unavailable.",
          { cause: error },
        ),
      );
    }
  });

  router.post("/recipes/search", async (request: Request, response: Response, next) => {
    const parsedRequest = recipeSearchRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendError(
        response,
        400,
        "INVALID_REQUEST",
        "Provide included and excluded ingredient lists, a supported maximum time, and an optional cursor.",
      );
      return;
    }
    if (!recipeService.isAvailable) {
      next(
        new ApiError(
          503,
          "SEARCH_UNAVAILABLE",
          "Recipe search is temporarily unavailable.",
        ),
      );
      return;
    }

    try {
      response.json(await recipeService.search(parsedRequest.data));
    } catch (error) {
      if (error instanceof InvalidRecipeSearchCursorError) {
        sendError(response, 400, "INVALID_CURSOR", error.message);
        return;
      }
      if (error instanceof InvalidRecipeCuisineError) {
        sendError(response, 400, "INVALID_REQUEST", error.message);
        return;
      }
      next(
        new ApiError(
          503,
          "GRAPH_UNAVAILABLE",
          "Recipe data is temporarily unavailable.",
          { cause: error },
        ),
      );
    }
  });

  router.get("/recipes/:id", async (request: Request, response: Response, next) => {
    const parsedParams = recipeDetailParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      sendError(response, 400, "INVALID_REQUEST", "Provide a valid recipe ID.");
      return;
    }
    if (!recipeService.isAvailable) {
      next(
        new ApiError(
          503,
          "SEARCH_UNAVAILABLE",
          "Recipe details are temporarily unavailable.",
        ),
      );
      return;
    }

    try {
      const recipe = await recipeService.getRecipeDetail(parsedParams.data.id);
      if (recipe === null) {
        sendError(response, 404, "RECIPE_NOT_FOUND", "The requested recipe was not found.");
        return;
      }
      response.json(recipe);
    } catch (error) {
      next(
        new ApiError(
          503,
          "GRAPH_UNAVAILABLE",
          "Recipe details are temporarily unavailable.",
          { cause: error },
        ),
      );
    }
  });

  return router;
}
