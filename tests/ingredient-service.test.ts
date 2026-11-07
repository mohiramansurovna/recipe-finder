import { describe, expect, it, vi } from "vitest";

import { IngredientsService } from "../api/src/application/services/ingredients.service.js";
import type { IngredientsRepository } from "../api/src/core/ingredients/ingredients.repository.js";

describe("IngredientsService", () => {
  it("uses repository vocabulary and aliases for deterministic parsing", async () => {
    const repository: IngredientsRepository = {
      getIngredientNames: vi.fn().mockResolvedValue(["green onion", "rice"]),
      getIngredientAliases: vi
        .fn()
        .mockResolvedValue([{ alias: "scallion", canonicalName: "green onion" }]),
      getIngredientCategories: vi.fn().mockResolvedValue(["dairy"]),
    };

    await expect(new IngredientsService(repository).parse("scallion, no dairy")).resolves.toEqual({
      included: ["green onion"],
      excluded: [],
      excludedCategories: ["dairy"],
      unrecognized: [],
    });
  });
});
