import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { parseIngredientText } from "./features/ingredients/ingredient-parser.js";
import type { IngredientRepository } from "./features/ingredients/ingredient-repository.js";

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

function sendError(response: Response, statusCode: number, code: string, message: string) {
  response.status(statusCode).json({ error: { code, message } });
}

function hasErrorType(error: unknown): error is Error & { type: string } {
  return error instanceof Error && "type" in error && typeof error.type === "string";
}

export function createApiApp(
  ingredientRepository: IngredientRepository,
  rateLimitMax = 100,
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
