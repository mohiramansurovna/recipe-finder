import { describe, expect, it, vi } from "vitest";

import {
  InvalidRecipeCuisineError,
  RecipeService,
} from "../api/src/features/recipes/application/recipe-service.js";
import type { RecipeSearchRepository } from "../api/src/features/recipes/ports/recipe-search-repository.js";

describe("RecipeService", () => {
  it("rejects unavailable cuisine selections before searching", async () => {
    const repository: RecipeSearchRepository = {
      getCuisineNames: vi.fn().mockResolvedValue(["Italian"]),
      search: vi.fn(),
      getRecipeDetail: vi.fn(),
    };
    const service = new RecipeService(repository);

    await expect(
      service.search({
        included: [],
        excluded: [],
        excludedCategories: [],
        cuisines: ["Unknown"],
        maxMinutes: null,
        cursor: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRecipeCuisineError);
    expect(repository.search).not.toHaveBeenCalled();
  });
});
