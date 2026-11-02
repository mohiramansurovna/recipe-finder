import { describe, expect, it } from "vitest";

import { parseIngredientText } from "../api/src/features/ingredients/ingredient-parser.js";

const vocabulary = [
  "butter",
  "chicken",
  "green onion",
  "green onion tops",
  "olive oil",
  "rice",
  "spinach",
];

describe("parseIngredientText", () => {
  it("parses included and specifically excluded ingredients from natural text", () => {
    expect(
      parseIngredientText("I have chicken, rice and spinach, no butter", vocabulary),
    ).toEqual({
      included: ["chicken", "rice", "spinach"],
      excluded: ["butter"],
      unrecognized: [],
    });
  });

  it("matches the longest multi-word ingredient phrase", () => {
    expect(parseIngredientText("green onion tops with olive oil", vocabulary)).toEqual({
      included: ["green onion tops", "olive oil"],
      excluded: [],
      unrecognized: [],
    });
  });

  it("supports without as explicit negation", () => {
    expect(parseIngredientText("chicken without rice", vocabulary)).toEqual({
      included: ["chicken"],
      excluded: ["rice"],
      unrecognized: [],
    });
  });

  it("normalizes case and punctuation while matching whole words", () => {
    expect(parseIngredientText("CHICKEN!!!, olive oil.", vocabulary)).toEqual({
      included: ["chicken", "olive oil"],
      excluded: [],
      unrecognized: [],
    });
  });

  it("reports unknown terms and does not expand unsupported category exclusions", () => {
    expect(parseIngredientText("no dairy, dragonfruit", vocabulary)).toEqual({
      included: [],
      excluded: [],
      unrecognized: ["dairy", "dragonfruit"],
    });
  });

  it("returns repeatable results for the same input and vocabulary", () => {
    const first = parseIngredientText("no butter, chicken", vocabulary);
    const second = parseIngredientText("no butter, chicken", vocabulary);

    expect(second).toEqual(first);
  });

  it("uses the last explicit category for duplicate recognized terms", () => {
    expect(parseIngredientText("butter, no butter", vocabulary)).toEqual({
      included: [],
      excluded: ["butter"],
      unrecognized: [],
    });
  });
});
