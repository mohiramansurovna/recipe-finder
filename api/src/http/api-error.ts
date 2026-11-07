import type { ErrorRequestHandler, Response } from "express";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function sendError(
  response: Response,
  statusCode: number,
  code: string,
  message: string,
): void {
  response.status(statusCode).json({ error: { code, message } });
}

function hasErrorType(error: unknown): error is Error & { type: string } {
  return error instanceof Error && "type" in error && typeof error.type === "string";
}

export const apiErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
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
