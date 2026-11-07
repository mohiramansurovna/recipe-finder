import { z } from 'zod';

export const parseIngredientsRequestSchema = z.object({ text: z.string().max(2000) }).strict();
