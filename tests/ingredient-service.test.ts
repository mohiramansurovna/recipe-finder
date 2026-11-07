import { describe, expect, it, vi } from "vitest";

import { IngredientService } from "../api/src/features/ingredients/application/ingredient-service.js";
import type { IngredientRepository } from "../api/src/features/ingredients/ports/ingredient-repository.js";

describe("IngredientService", () => {
  it("uses repository vocabulary and aliases for deterministic parsing", async () => {
    const repository: IngredientRepository = {
      getIngredientNames: vi.fn().mockResolvedValue(["green onion", "rice"]),
      getIngredientAliases: vi
        .fn()
        .mockResolvedValue([{ alias: "scallion", canonicalName: "green onion" }]),
      getIngredientCategories: vi.fn().mockResolvedValue(["dairy"]),
    };

    await expect(new IngredientService(repository).parse("scallion, no dairy")).resolves.toEqual({
      included: ["green onion"],
      excluded: [],
      excludedCategories: ["dairy"],
      unrecognized: [],
    });
  });
});
