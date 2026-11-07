import { Router, type Request, type Response } from 'express';

import type { IngredientsService } from '../../../application/services/ingredients.service.js';
import { graphUnavailable, sendError } from '../api-error.js';
import { parseIngredientsRequestSchema } from '../schemas/ingredients.schemas.js';

export function createIngredientsRouter(ingredientService: IngredientsService): Router {
    const router = Router();

    router.get('/ingredients', async (_request: Request, response: Response, next) => {
        try {
            response.json({ ingredients: await ingredientService.getIngredientNames() });
        } catch (error) {
            next(graphUnavailable('Ingredient data is temporarily unavailable.', error));
        }
    });

    router.post('/ingredients/parse', async (request: Request, response: Response, next) => {
        const parsed = parseIngredientsRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(
                response,
                400,
                'INVALID_REQUEST',
                'Provide a text field with at most 2000 characters.'
            );
            return;
        }

        try {
            response.json(await ingredientService.parse(parsed.data.text));
        } catch (error) {
            next(graphUnavailable('Ingredient data is temporarily unavailable.', error));
        }
    });

    return router;
}
