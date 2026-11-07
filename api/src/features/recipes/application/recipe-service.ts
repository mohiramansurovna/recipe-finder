import type {
  RecipeDetail,
  RecipeSearchCriteria,
  RecipeSearchPage,
} from "../recipe-search-types.js";
import type { RecipeSearchRepository } from "../ports/recipe-search-repository.js";

export class InvalidRecipeCuisineError extends Error {
  constructor() {
    super("Cuisine selections must match available recipe cuisines.");
    this.name = "InvalidRecipeCuisineError";
  }
}

export class RecipeService {
  constructor(private readonly repository?: RecipeSearchRepository) {}

  get isAvailable(): boolean {
    return this.repository !== undefined;
  }

  async getCuisineNames(): Promise<readonly string[]> {
    if (this.repository === undefined) throw new Error("Recipe search is unavailable.");
    return this.repository.getCuisineNames();
  }

  async search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage> {
    if (this.repository === undefined) throw new Error("Recipe search is unavailable.");
    const availableCuisines = new Set(await this.repository.getCuisineNames());
    if (criteria.cuisines.some((cuisine) => !availableCuisines.has(cuisine))) {
      throw new InvalidRecipeCuisineError();
    }
    return this.repository.search(criteria);
  }

  async getRecipeDetail(id: string): Promise<RecipeDetail | null> {
    if (this.repository === undefined) throw new Error("Recipe search is unavailable.");
    return this.repository.getRecipeDetail(id);
  }
}
