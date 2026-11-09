import { Router } from 'express';

import type { IngredientsService } from '../../application/services/ingredients.service.js';
import type { RecipesService } from '../../application/services/recipes.service.js';
import type { AccountsService } from '../../application/services/accounts.service.js';
import { createAccountsRouter } from './routes/accounts.routes.js';
import { createFiltersRouter } from './routes/filters.routes.js';
import { createIngredientsRouter } from './routes/ingredients.routes.js';
import { createRecipesRouter } from './routes/recipes.routes.js';

export function createApiRouter(
    ingredientService: IngredientsService,
    recipeService: RecipesService,
    accountsService?: AccountsService
): Router {
    const router = Router();
    if (accountsService !== undefined) router.use(createAccountsRouter(accountsService));
    router.use(createIngredientsRouter(ingredientService));
    router.use(createFiltersRouter(ingredientService, recipeService));
    router.use(createRecipesRouter(recipeService));
    return router;
}
