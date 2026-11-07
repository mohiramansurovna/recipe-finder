import { describe, expect, it } from "vitest";

import { RecipesMapper } from "../api/src/infrastructure/mappers/recipes.mapper.js";

describe("RecipesMapper.toDomain", () => {
  it("reports matched, missing, and excluded recipe ingredients", () => {
    expect(
      RecipesMapper.toDomain(
        {
          id: "42",
          name: "Chicken rice",
          minutes: 25,
          ingredientNames: ["chicken", "rice", "butter"],
        },
        { included: ["rice", "chicken"], excluded: ["butter", "salt"] },
      ),
    ).toEqual({
      id: "42",
      name: "Chicken rice",
      minutes: 25,
      matchedIngredients: ["rice", "chicken"],
      missingIngredients: ["butter"],
      excludedIngredients: ["butter"],
    });
  });

  it("keeps recipes with unknown cooking times", () => {
    expect(
      RecipesMapper.toDomain(
        { id: "43", name: "Salad", minutes: null, ingredientNames: ["spinach"] },
        { included: ["spinach"], excluded: [] },
      ),
    ).toMatchObject({ minutes: null, matchedIngredients: ["spinach"] });
  });
});
