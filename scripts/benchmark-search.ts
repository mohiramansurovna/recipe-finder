import 'dotenv/config';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import { z } from 'zod';

import type { RecipeSearchCriteria } from '../api/src/core/recipes/recipes.types.js';
import { RecipesService } from '../api/src/application/services/recipes.service.js';
import { Neo4jRecipesRepository } from '../api/src/infrastructure/neo4j/repositories/recipes.neo4j.repository.js';

const configSchema = z.object({
    NEO4J_URI: z.string().min(1).default('bolt://localhost:7687'),
    NEO4J_USER: z.string().min(1).default('neo4j'),
    NEO4J_PASSWORD: z.string().min(1),
    NEO4J_DATABASE: z.string().min(1).default('neo4j'),
});

type Scenario = {
    name: string;
    criteria: Partial<Omit<RecipeSearchCriteria, 'cursor'>> & { included: readonly string[] };
    pages: number;
};

const base = { excluded: [], excludedCategories: [], cuisines: [], maxMinutes: null, minRating: null } as const;

export const SCENARIOS: readonly Scenario[] = [
    { name: 'rare x1', criteria: { ...base, included: ['15 bean mix'] }, pages: 1 },
    { name: 'common x1', criteria: { ...base, included: ['onion'] }, pages: 1 },
    { name: 'common x3', criteria: { ...base, included: ['onion', 'butter', 'sugar'] }, pages: 1 },
    { name: 'very common x5', criteria: { ...base, included: ['salt', 'butter', 'sugar', 'onion', 'eggs'] }, pages: 1 },
    { name: 'mixed rare+common', criteria: { ...base, included: ['15 bean mix', 'onion', 'salt'] }, pages: 1 },
    {
        name: 'exclusions',
        criteria: { ...base, included: ['onion', 'butter'], excluded: ['salt'], excludedCategories: ['dairy'] },
        pages: 1,
    },
    { name: 'filters', criteria: { ...base, included: ['onion', 'butter'], cuisines: ['Italian'], maxMinutes: 30 }, pages: 1 },
    { name: 'deep pages (5)', criteria: { ...base, included: ['onion', 'butter', 'sugar'] }, pages: 5 },
];

async function main(): Promise<void> {
    const config = configSchema.parse(process.env);
    const runs = Number(process.env['BENCHMARK_RUNS'] ?? '3');
    const driver = neo4j.driver(config.NEO4J_URI, neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD));
    try {
        const repository = new RecipesService(new Neo4jRecipesRepository(driver, config.NEO4J_DATABASE));
        await repository.getCuisineNames(); // warm the connection
        console.log(`Search benchmark (${runs} runs each; times are per full scenario, in ms)`);
        for (const scenario of SCENARIOS) {
            const times: number[] = [];
            let totalCount = 0;
            let returned = 0;
            for (let run = 0; run < runs; run += 1) {
                const started = performance.now();
                let cursor: string | null = null;
                returned = 0;
                for (let page = 0; page < scenario.pages; page += 1) {
                    const result: Awaited<ReturnType<typeof repository.search>> = await repository.search({
                        ...base,
                        ...scenario.criteria,
                        cursor,
                    });
                    totalCount = result.totalCount;
                    returned += result.recipes.length;
                    cursor = result.nextCursor;
                    if (cursor === null) break;
                }
                times.push(performance.now() - started);
            }
            times.sort((a, b) => a - b);
            const median = times[Math.floor(times.length / 2)] ?? 0;
            console.log(
                `${scenario.name.padEnd(20)} min ${(times[0] ?? 0).toFixed(0).padStart(6)}  median ${median.toFixed(0).padStart(6)}  ` +
                    `total ${String(totalCount).padStart(7)}  returned ${returned}`,
            );
        }
    } finally {
        await driver.close();
    }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : 'Benchmark failed.');
        process.exitCode = 1;
    });
}
