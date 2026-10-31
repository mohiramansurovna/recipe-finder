import { describe, expect, it } from "vitest";

import {
  normalizeIngredientName,
  parseIngredientList,
  prepareRecipeRow,
} from "../scripts/prepare-data.js";

describe("ingredient preparation", () => {
  it("normalizes case, surrounding whitespace, and punctuation", () => {
    expect(normalizeIngredientName("  !!! OLIVE OIL,  ")).toBe("olive oil");
  });

  it("keeps semantic variants as separate ingredient names", () => {
    const prepared = prepareRecipeRow({
      id: "1",
      name: "Greens",
      minutes: "15",
      ingredients: "['scallion', 'green onion']",
      contributor_id: "must-not-be-exported",
    });

    expect(prepared.ingredients.map(({ name }) => name)).toEqual([
      "green onion",
      "scallion",
    ]);
  });

  it("parses escaped quotes without evaluating source text", () => {
    expect(parseIngredientList("['cook\\'s salt', \"pepper\"]")).toEqual([
      "cook's salt",
      "pepper",
    ]);
  });

  it("rejects malformed or non-string ingredient lists", () => {
    expect(() => parseIngredientList("__import__('os').system('false')")).toThrow(
      "Python-style list",
    );
    expect(() => parseIngredientList("[1, 'salt']")).toThrow("quoted strings");
  });
});

describe("recipe row preparation", () => {
  it("projects only graph data and marks explicit staple ingredients", () => {
    const prepared = prepareRecipeRow({
      id: "42",
      name: "  A recipe  ",
      minutes: "30",
      ingredients: "['salt', 'olive oil', 'chicken', 'salt']",
      contributor_id: "never-export",
      tags: "not part of graph output",
    });

    expect(prepared).toEqual({
      recipe: { id: "42", name: "A recipe", minutes: 30 },
      ingredients: [
        { name: "chicken", isStaple: false },
        { name: "olive oil", isStaple: true },
        { name: "salt", isStaple: true },
      ],
      uses: [
        { recipeId: "42", ingredientName: "chicken" },
        { recipeId: "42", ingredientName: "olive oil" },
        { recipeId: "42", ingredientName: "salt" },
      ],
      cookingTimeIssue: null,
      isCookingTimeOutlier: false,
    });
  });

  it.each([
    ["", "missing"],
    ["not a number", "invalid"],
    ["-1", "invalid"],
  ] as const)("preserves invalid cooking time as null and reports %s", (minutes, reason) => {
    const prepared = prepareRecipeRow({
      id: "43",
      name: "A recipe",
      minutes,
      ingredients: "['salt']",
    });

    expect(prepared.recipe.minutes).toBeNull();
    expect(prepared.cookingTimeIssue).toEqual({
      recipeId: "43",
      sourceValue: minutes,
      reason,
    });
  });

  it("keeps valid suspected outliers unchanged and marks them for reporting", () => {
    const prepared = prepareRecipeRow({
      id: "44",
      name: "Slow recipe",
      minutes: "133",
      ingredients: "['oil']",
    });

    expect(prepared.recipe.minutes).toBe(133);
    expect(prepared.isCookingTimeOutlier).toBe(true);
  });

  it("rejects rows without required graph identity or ingredient data", () => {
    expect(() =>
      prepareRecipeRow({ id: "", name: "A recipe", minutes: "10", ingredients: "[]" }),
    ).toThrow("missing required id");
    expect(() =>
      prepareRecipeRow({ id: "1", name: "A recipe", minutes: "10", ingredients: "['!']" }),
    ).toThrow("empty ingredient name");
  });
});
