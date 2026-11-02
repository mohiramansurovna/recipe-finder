import { z } from "zod";

const ingredientListSchema = z.object({
  ingredients: z.array(z.string()),
});

const parseResultSchema = z.object({
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  unrecognized: z.array(z.string()),
});

const errorResponseSchema = z.object({
  error: z.object({ message: z.string() }),
});

async function requestJson<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(body);
    throw new Error(
      errorResponse.success
        ? errorResponse.data.error.message
        : "The request could not be completed.",
    );
  }

  return schema.parse(body);
}

export async function fetchIngredientVocabulary(): Promise<string[]> {
  const body = await requestJson("/api/ingredients", ingredientListSchema);
  return body.ingredients;
}

export async function parseIngredients(text: string) {
  return requestJson(
    "/api/ingredients/parse",
    parseResultSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
  );
}
