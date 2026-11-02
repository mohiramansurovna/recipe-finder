import { describe, expect, it } from "vitest";

import { mapRecipeSearchResult } from "../api/src/features/recipes/recipe-search-types.js";

describe("mapRecipeSearchResult", () => {
  it("reports matched, missing, and excluded recipe ingredients", () => {
    expect(
      mapRecipeSearchResult(
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
      mapRecipeSearchResult(
        { id: "43", name: "Salad", minutes: null, ingredientNames: ["spinach"] },
        { included: ["spinach"], excluded: [] },
      ),
    ).toMatchObject({ minutes: null, matchedIngredients: ["spinach"] });
  });
});
