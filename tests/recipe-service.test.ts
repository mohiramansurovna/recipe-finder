import { describe, expect, it, vi } from "vitest";

import {
  InvalidRecipeCuisineError,
  RecipesService,
} from "../api/src/application/services/recipes.service.js";
import type { RecipesRepository } from "../api/src/core/recipes/recipes.repository.js";

describe("RecipesService", () => {
  it("rejects unavailable cuisine selections before searching", async () => {
    const repository: RecipesRepository = {
      getCuisineNames: vi.fn().mockResolvedValue(["Italian"]),
      search: vi.fn(),
      getRecipeDetail: vi.fn(),
    };
    const service = new RecipesService(repository);

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
