import express from 'express';
import { rateLimit } from 'express-rate-limit';

import { IngredientsService } from './application/services/ingredients.service.js';
import type { IngredientsRepository } from './core/ingredients/ingredients.repository.js';
import { RecipesService } from './application/services/recipes.service.js';
import type { AccountsService } from './application/services/accounts.service.js';
import type { RecipesRepository } from './core/recipes/recipes.repository.js';
import { apiErrorHandler } from './interface/http/api-error.js';
import { createApiRouter } from './interface/http/api-router.js';

export function createApiApp(
    ingredientRepository: IngredientsRepository,
    rateLimitMax = 100,
    recipeSearchRepository?: RecipesRepository,
    accountsService?: AccountsService,
    readinessCheck?: () => Promise<void>,
    trustProxyHops = 0
) {
    const app = express();
    if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
    const ingredientService = new IngredientsService(ingredientRepository);
    const recipeService = new RecipesService(recipeSearchRepository);

    app.get('/health', async (_request, response) => {
        try {
            await readinessCheck?.();
            response.json({ status: 'ok' });
        } catch {
            response.status(503).json({ status: 'error' });
        }
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
    app.use('/api', createApiRouter(ingredientService, recipeService, accountsService));
    app.use(apiErrorHandler);

    return app;
}
