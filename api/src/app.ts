import express from 'express';
import { rateLimit } from 'express-rate-limit';

import { IngredientsService } from './application/services/ingredients.service.js';
import type { IngredientsRepository } from './core/ingredients/ingredients.repository.js';
import { RecipesService } from './application/services/recipes.service.js';
import type { RecipesRepository } from './core/recipes/recipes.repository.js';
import { apiErrorHandler } from './interface/http/api-error.js';
import { createApiRouter } from './interface/http/api-router.js';

export function createApiApp(
    ingredientRepository: IngredientsRepository,
    rateLimitMax = 100,
    recipeSearchRepository?: RecipesRepository
) {
    const app = express();
    const ingredientService = new IngredientsService(ingredientRepository);
    const recipeService = new RecipesService(recipeSearchRepository);

    app.get('/health', (_request, response) => {
        response.json({ status: 'ok' });
    });
    app.use(express.json({ limit: '16kb' }));
    app.use(
        '/api',
        rateLimit({
            windowMs: 60_000,
            limit: rateLimitMax,
            standardHeaders: 'draft-8',
            legacyHeaders: false,
            handler: (_request, response) => {
                response
                    .status(429)
                    .json({
                        error: {
                            code: 'RATE_LIMITED',
                            message: 'Too many requests. Try again later.',
                        },
                    });
            },
        })
    );
    app.use('/api', createApiRouter(ingredientService, recipeService));
    app.use(apiErrorHandler);

    return app;
}
