import { describe, expect, it } from "vitest";

import { parseIngredientText } from "../api/src/features/ingredients/domain/ingredient-parser.js";

const vocabulary = [
  "butter",
  "chicken",
  "green onion",
  "green onion tops",
  "olive oil",
  "rice",
  "spinach",
];
const aliases = [{ alias: "scallion", canonicalName: "green onion" }];

describe("parseIngredientText", () => {
  it("parses included and specifically excluded ingredients from natural text", () => {
    expect(
      parseIngredientText("I have chicken, rice and spinach, no butter", vocabulary),
    ).toEqual({
      included: ["chicken", "rice", "spinach"],
      excluded: ["butter"],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it("matches the longest multi-word ingredient phrase", () => {
    expect(parseIngredientText("green onion tops with olive oil", vocabulary)).toEqual({
      included: ["green onion tops", "olive oil"],
      excluded: [],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it("supports without as explicit negation", () => {
    expect(parseIngredientText("chicken without rice", vocabulary)).toEqual({
      included: ["chicken"],
      excluded: ["rice"],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it("normalizes case and punctuation while matching whole words", () => {
    expect(parseIngredientText("CHICKEN!!!, olive oil.", vocabulary)).toEqual({
      included: ["chicken", "olive oil"],
      excluded: [],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it("reports unknown terms and does not expand unsupported category exclusions", () => {
    expect(parseIngredientText("no dairy, dragonfruit", vocabulary)).toEqual({
      included: [],
      excluded: [],
      excludedCategories: [],
      unrecognized: ["dairy", "dragonfruit"],
    });
  });

  it("recognizes supported broad category exclusions without expanding them", () => {
    expect(
      parseIngredientText(
        "chicken, no dairy, no fish/seafood",
        vocabulary,
        [],
        ["dairy", "nuts", "meat", "fish/seafood"],
      ),
    ).toEqual({
      included: ["chicken"],
      excluded: [],
      excludedCategories: ["dairy", "fish/seafood"],
      unrecognized: [],
    });
  });

  it("recognizes category exclusions in possession negation", () => {
    expect(
      parseIngredientText(
        "I don't have any dairy",
        vocabulary,
        [],
        ["dairy", "nuts", "meat", "fish/seafood"],
      ),
    ).toEqual({
      included: [],
      excluded: [],
      excludedCategories: ["dairy"],
      unrecognized: [],
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
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it.each([
    ["I don't have butter", "butter"],
    ["I don’t have any butter", "butter"],
    ["I do not have butter", "butter"],
  ])("understands possession negation in %s", (text, ingredient) => {
    expect(parseIngredientText(text, vocabulary)).toEqual({
      included: [],
      excluded: [ingredient],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it("keeps an unknown possession-negated ingredient unrecognized", () => {
    expect(parseIngredientText("I don't have dragonfruit", vocabulary)).toEqual({
      included: [],
      excluded: [],
      excludedCategories: [],
      unrecognized: ["dragonfruit"],
    });
  });

  it("resolves aliases to canonical names and deduplicates canonical phrases", () => {
    expect(
      parseIngredientText("scallion and green onion", vocabulary, aliases),
    ).toEqual({
      included: ["green onion"],
      excluded: [],
      excludedCategories: [],
      unrecognized: [],
    });
    expect(parseIngredientText("no scallion", vocabulary, aliases)).toEqual({
      included: [],
      excluded: ["green onion"],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it.each([
    ["chiken", "chicken"],
    ["butterr", "butter"],
    ["chickan", "chicken"],
    ["chikcen", "chicken"],
  ])("recognizes one-edit typo %s", (typo, canonicalName) => {
    expect(parseIngredientText(typo, vocabulary)).toEqual({
      included: [canonicalName],
      excluded: [],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it("recognizes a typo inside a multi-word ingredient and in a negation", () => {
    expect(parseIngredientText("green onoin, no buttr", vocabulary)).toEqual({
      included: ["green onion"],
      excluded: ["butter"],
      excludedCategories: [],
      unrecognized: [],
    });
  });

  it("leaves short and equally close typo candidates unrecognized", () => {
    expect(parseIngredientText("btr", ["butter"])).toEqual({
      included: [],
      excluded: [],
      excludedCategories: [],
      unrecognized: ["btr"],
    });
    expect(parseIngredientText("batter", ["butter", "better"])).toEqual({
      included: [],
      excluded: [],
      excludedCategories: [],
      unrecognized: ["batter"],
    });
  });
});
