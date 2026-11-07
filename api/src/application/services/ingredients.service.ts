import { parseIngredientText, type IngredientParseResult } from '../utils/ingredient-parser.js';
import type { IngredientsRepository } from '../../core/ingredients/ingredients.repository.js';

export class IngredientsService {
    constructor(private readonly repository: IngredientsRepository) {}

    getIngredientNames(): Promise<readonly string[]> {
        return this.repository.getIngredientNames();
    }

    getIngredientCategories(): Promise<readonly string[]> {
        return this.repository.getIngredientCategories();
    }

    async parse(text: string): Promise<IngredientParseResult> {
        const [vocabulary, aliases, categories] = await Promise.all([
            this.repository.getIngredientNames(),
            this.repository.getIngredientAliases(),
            this.repository.getIngredientCategories(),
        ]);
        return parseIngredientText(text, vocabulary, aliases, categories);
    }
}
