import { parseIngredientText } from "../domain/ingredient-parser.js";
import type { IngredientRepository } from "../ports/ingredient-repository.js";
import type { IngredientParseResult } from "../domain/ingredient-parser.js";

export class IngredientService {
  constructor(private readonly repository: IngredientRepository) {}

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
