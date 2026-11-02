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
const aliases = [{ alias: "scallion", canonicalName: "green onion" }];

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

  it.each([
    ["I don't have butter", "butter"],
    ["I don’t have any butter", "butter"],
    ["I do not have butter", "butter"],
  ])("understands possession negation in %s", (text, ingredient) => {
    expect(parseIngredientText(text, vocabulary)).toEqual({
      included: [],
      excluded: [ingredient],
      unrecognized: [],
    });
  });

  it("keeps an unknown possession-negated ingredient unrecognized", () => {
    expect(parseIngredientText("I don't have dragonfruit", vocabulary)).toEqual({
      included: [],
      excluded: [],
      unrecognized: ["dragonfruit"],
    });
  });

  it("resolves aliases to canonical names and deduplicates canonical phrases", () => {
    expect(
      parseIngredientText("scallion and green onion", vocabulary, aliases),
    ).toEqual({
      included: ["green onion"],
      excluded: [],
      unrecognized: [],
    });
    expect(parseIngredientText("no scallion", vocabulary, aliases)).toEqual({
      included: [],
      excluded: ["green onion"],
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
      unrecognized: [],
    });
  });

  it("recognizes a typo inside a multi-word ingredient and in a negation", () => {
    expect(parseIngredientText("green onoin, no buttr", vocabulary)).toEqual({
      included: ["green onion"],
      excluded: ["butter"],
      unrecognized: [],
    });
  });

  it("leaves short and equally close typo candidates unrecognized", () => {
    expect(parseIngredientText("btr", ["butter"])).toEqual({
      included: [],
      excluded: [],
      unrecognized: ["btr"],
    });
    expect(parseIngredientText("batter", ["butter", "better"])).toEqual({
      included: [],
      excluded: [],
      unrecognized: ["batter"],
    });
  });
});
