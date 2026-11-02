import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { parseIngredientText } from "./features/ingredients/ingredient-parser.js";
import type { IngredientRepository } from "./features/ingredients/ingredient-repository.js";
import { InvalidRecipeSearchCursorError } from "./features/recipes/recipe-search-cursor.js";
import type { RecipeSearchRepository } from "./features/recipes/recipe-search-types.js";

class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

const parseRequestSchema = z.object({ text: z.string().max(2000) }).strict();
const ingredientCriteriaSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(100)
  .refine((ingredients) => new Set(ingredients).size === ingredients.length);
const recipeSearchRequestSchema = z
  .object({
    included: ingredientCriteriaSchema,
    excluded: ingredientCriteriaSchema,
    maxMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).nullable().default(null),
    cursor: z.string().min(1).max(4096).nullable().default(null),
  })
  .strict();

function sendError(response: Response, statusCode: number, code: string, message: string) {
  response.status(statusCode).json({ error: { code, message } });
}

function hasErrorType(error: unknown): error is Error & { type: string } {
  return error instanceof Error && "type" in error && typeof error.type === "string";
}

export function createApiApp(
  ingredientRepository: IngredientRepository,
  rateLimitMax = 100,
  recipeSearchRepository?: RecipeSearchRepository,
) {
  const app = express();

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
        sendError(response, 429, "RATE_LIMITED", "Too many requests. Try again later.");
      },
    }),
  );

  app.get("/api/ingredients", async (_request: Request, response: Response, next) => {
    try {
      response.json({ ingredients: await ingredientRepository.getIngredientNames() });
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

  app.post("/api/ingredients/parse", async (request: Request, response: Response, next) => {
    const parsedRequest = parseRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendError(response, 400, "INVALID_REQUEST", "Provide a text field with at most 2000 characters.");
      return;
    }

    try {
      const vocabulary = await ingredientRepository.getIngredientNames();
      response.json(parseIngredientText(parsedRequest.data.text, vocabulary));
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

  app.post("/api/recipes/search", async (request: Request, response: Response, next) => {
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

    if (recipeSearchRepository === undefined) {
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
      response.json(await recipeSearchRepository.search(parsedRequest.data));
    } catch (error) {
      if (error instanceof InvalidRecipeSearchCursorError) {
        sendError(response, 400, "INVALID_CURSOR", error.message);
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

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    void _next;
    if (hasErrorType(error) && error.type === "entity.parse.failed") {
      sendError(response, 400, "INVALID_JSON", "Request body must contain valid JSON.");
      return;
    }
    if (hasErrorType(error) && error.type === "entity.too.large") {
      sendError(response, 413, "REQUEST_TOO_LARGE", "Request body exceeds the allowed size.");
      return;
    }
    if (error instanceof ApiError) {
      if (error.statusCode >= 500) console.error(error.message, error.cause);
      sendError(response, error.statusCode, error.code, error.message);
      return;
    }

    console.error("Unhandled API request error:", error);
    sendError(response, 500, "INTERNAL_ERROR", "The request could not be completed.");
  };
  app.use(errorHandler);

  return app;
}
