import { z } from "zod";

const ingredientListSchema = z.object({
  ingredients: z.array(z.string()),
});

const filterOptionsSchema = z.object({
  categories: z.array(z.string()),
  cuisines: z.array(z.string()),
});

const parseResultSchema = z.object({
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  excludedCategories: z.array(z.string()),
  unrecognized: z.array(z.string()),
});

const recipeSearchPageSchema = z.object({
  recipes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      minutes: z.number().int().nonnegative().nullable(),
      matchedIngredients: z.array(z.string()),
      missingIngredients: z.array(z.string()),
      excludedIngredients: z.array(z.string()),
    }),
  ),
  totalCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});

const recipeDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  minutes: z.number().int().nonnegative().nullable(),
  instructions: z.array(z.string()).nullable(),
  ingredients: z.array(z.string()),
  cuisines: z.array(z.string()),
  ratings: z.object({
    individual: z.array(z.number().int().min(1).max(5)),
    aggregate: z.number().positive().max(5).nullable(),
  }),
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

export async function fetchFilterOptions() {
  return requestJson("/api/filters", filterOptionsSchema);
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

export type RecipeSearchPage = z.infer<typeof recipeSearchPageSchema>;
export type RecipeDetail = z.infer<typeof recipeDetailSchema>;

export async function fetchRecipeDetail(
  id: string,
  signal?: AbortSignal,
): Promise<RecipeDetail> {
  return requestJson(
    `/api/recipes/${encodeURIComponent(id)}`,
    recipeDetailSchema,
    { signal },
  );
}

export async function searchRecipes(
  criteria: {
    included: readonly string[];
    excluded: readonly string[];
    excludedCategories: readonly string[];
    cuisines: readonly string[];
  },
  maxMinutes: number | null,
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<RecipeSearchPage> {
  return requestJson(
    "/api/recipes/search",
    recipeSearchPageSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        included: criteria.included,
        excluded: criteria.excluded,
        excludedCategories: criteria.excludedCategories,
        cuisines: criteria.cuisines,
        maxMinutes,
        cursor,
      }),
      signal,
    },
  );
}
