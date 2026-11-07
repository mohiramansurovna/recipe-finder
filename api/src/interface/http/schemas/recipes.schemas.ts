import { z } from 'zod';

const hasUniqueItems = (items: readonly unknown[]): boolean => new Set(items).size === items.length;

const ingredientCriteriaSchema = z
    .array(z.string().trim().min(1).max(200))
    .max(100)
    .refine(hasUniqueItems);

const categoryCriteriaSchema = z
    .array(z.enum(['dairy', 'nuts', 'meat', 'fish/seafood']))
    .max(4)
    .default([])
    .refine(hasUniqueItems);

const cuisineCriteriaSchema = z
    .array(z.string().trim().min(1).max(100))
    .max(50)
    .default([])
    .refine(hasUniqueItems);

export const recipeSearchRequestSchema = z
    .object({
        included: ingredientCriteriaSchema,
        excluded: ingredientCriteriaSchema,
        excludedCategories: categoryCriteriaSchema,
        cuisines: cuisineCriteriaSchema,
        maxMinutes: z
            .union([z.literal(15), z.literal(30), z.literal(60)])
            .nullable()
            .default(null),
        cursor: z.string().min(1).max(4096).nullable().default(null),
    })
    .strict();

export const recipeDetailParamsSchema = z.object({ id: z.string().trim().min(1).max(100) });
