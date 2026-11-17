import { Router, type Request, type Response } from 'express';

import {
    IngredientsRequiredError,
    InvalidRecipeCuisineError,
    RatingFilterUnavailableError,
    type RecipesService,
} from '../../../application/services/recipes.service.js';
import { InvalidRecipeSearchCursorError } from '../../../core/recipes/recipe-search.cursor.js';
import { graphUnavailable, searchUnavailable, sendError } from '../api-error.js';
import { recipeDetailParamsSchema, recipeSearchRequestSchema } from '../schemas/recipes.schemas.js';

export function createRecipesRouter(recipeService: RecipesService): Router {
    const router = Router();

    router.post('/recipes/search', async (request: Request, response: Response, next) => {
        const parsed = recipeSearchRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            sendError(
                response,
                400,
                'INVALID_REQUEST',
                'Provide included and excluded ingredient lists, a supported maximum time, and an optional cursor.'
            );
            return;
        }
        if (!recipeService.isAvailable) {
            next(searchUnavailable('Recipe search is temporarily unavailable.'));
            return;
        }

        try {
            response.json(await recipeService.search(parsed.data));
        } catch (error) {
            if (error instanceof InvalidRecipeSearchCursorError) {
                sendError(response, 400, 'INVALID_CURSOR', error.message);
                return;
            }
            if (error instanceof IngredientsRequiredError) {
                sendError(response, 400, 'INGREDIENTS_REQUIRED', error.message);
                return;
            }
            if (error instanceof RatingFilterUnavailableError) {
                next(searchUnavailable(error.message));
                return;
            }
            if (error instanceof InvalidRecipeCuisineError) {
                sendError(response, 400, 'INVALID_REQUEST', error.message);
                return;
            }
            next(graphUnavailable('Recipe data is temporarily unavailable.', error));
        }
    });

    router.get('/recipes/:id', async (request: Request, response: Response, next) => {
        const parsed = recipeDetailParamsSchema.safeParse(request.params);
        if (!parsed.success) {
            sendError(response, 400, 'INVALID_REQUEST', 'Provide a valid recipe ID.');
            return;
        }
        if (!recipeService.isAvailable) {
            next(searchUnavailable('Recipe details are temporarily unavailable.'));
            return;
        }

        try {
            const recipe = await recipeService.getRecipeDetail(parsed.data.id);
            if (recipe === null) {
                sendError(response, 404, 'RECIPE_NOT_FOUND', 'The requested recipe was not found.');
                return;
            }
            response.json(recipe);
        } catch (error) {
            next(graphUnavailable('Recipe details are temporarily unavailable.', error));
        }
    });

    return router;
}
