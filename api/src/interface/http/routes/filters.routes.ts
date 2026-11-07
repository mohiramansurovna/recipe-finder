import { Router, type Request, type Response } from 'express';

import type { IngredientsService } from '../../../application/services/ingredients.service.js';
import type { RecipesService } from '../../../application/services/recipes.service.js';
import { graphUnavailable, searchUnavailable } from '../api-error.js';

export function createFiltersRouter(
    ingredientService: IngredientsService,
    recipeService: RecipesService
): Router {
    const router = Router();

    router.get('/filters', async (_request: Request, response: Response, next) => {
        if (!recipeService.isAvailable) {
            next(searchUnavailable('Recipe filters are temporarily unavailable.'));
            return;
        }
        try {
            const [categories, cuisines] = await Promise.all([
                ingredientService.getIngredientCategories(),
                recipeService.getCuisineNames(),
            ]);
            response.json({ categories, cuisines });
        } catch (error) {
            next(graphUnavailable('Recipe filters are temporarily unavailable.', error));
        }
    });

    return router;
}
