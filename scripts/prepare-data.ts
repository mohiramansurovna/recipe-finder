import { isCookingTimeOutlier } from "./cooking-time.js";

export const STAPLE_INGREDIENTS = new Set([
  "canola oil",
  "olive oil",
  "oil",
  "salt",
  "vegetable oil",
]);

export type RawRecipeRow = Readonly<Record<string, string>>;

export interface PreparedRecipe {
  id: string;
  name: string;
  minutes: number | null;
}

export interface PreparedIngredient {
  name: string;
  isStaple: boolean;
}

export interface PreparedUse {
  recipeId: string;
  ingredientName: string;
}

export interface CookingTimeIssue {
  recipeId: string;
  sourceValue: string;
  reason: "missing" | "invalid";
}

export interface PreparedRecipeRow {
  recipe: PreparedRecipe;
  ingredients: PreparedIngredient[];
  uses: PreparedUse[];
  cookingTimeIssue: CookingTimeIssue | null;
  isCookingTimeOutlier: boolean;
}

const PYTHON_ESCAPES: Readonly<Record<string, string>> = {
  a: "\u0007",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\u000b",
  "\\": "\\",
  "'": "'",
  '"': '"',
};

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/u.test(source[index] ?? "")) index += 1;
  return index;
}

function readHexEscape(source: string, start: number, length: number): [string, number] {
  const hex = source.slice(start, start + length);
  if (hex.length !== length || !/^[\da-f]+$/iu.test(hex)) {
    throw new Error("Ingredient list contains an invalid hexadecimal escape.");
  }
  return [String.fromCodePoint(Number.parseInt(hex, 16)), start + length];
}

function readIngredientString(source: string, start: number): [string, number] {
  const quote = source[start];
  if (quote !== "'" && quote !== '"') {
    throw new Error("Ingredient list entries must be quoted strings.");
  }

  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const character = source[index] ?? "";
    if (character === quote) return [value, index + 1];
    if (character !== "\\") {
      value += character;
      index += 1;
      continue;
    }

    const escaped = source[index + 1];
    if (escaped === undefined) break;
    if (escaped === "x") {
      [value, index] = readHexEscape(source, index + 2, 2);
      continue;
    }
    if (escaped === "u") {
      [value, index] = readHexEscape(source, index + 2, 4);
      continue;
    }
    if (escaped === "U") {
      [value, index] = readHexEscape(source, index + 2, 8);
      continue;
    }

    value += PYTHON_ESCAPES[escaped] ?? escaped;
    index += 2;
  }

  throw new Error("Ingredient list contains an unterminated string.");
}

export function parseIngredientList(source: string): string[] {
  let index = skipWhitespace(source, 0);
  if (source[index] !== "[") {
    throw new Error("Ingredients must be a Python-style list of strings.");
  }
  index = skipWhitespace(source, index + 1);

  const ingredients: string[] = [];
  if (source[index] === "]") {
    index = skipWhitespace(source, index + 1);
    if (index !== source.length) throw new Error("Unexpected content after ingredient list.");
    return ingredients;
  }

  while (index < source.length) {
    let ingredient: string;
    [ingredient, index] = readIngredientString(source, index);
    ingredients.push(ingredient);
    index = skipWhitespace(source, index);

    if (source[index] === "]") {
      index = skipWhitespace(source, index + 1);
      if (index !== source.length) throw new Error("Unexpected content after ingredient list.");
      return ingredients;
    }
    if (source[index] !== ",") throw new Error("Expected a comma between ingredients.");
    index = skipWhitespace(source, index + 1);
    if (source[index] === "]") {
      index = skipWhitespace(source, index + 1);
      if (index !== source.length) throw new Error("Unexpected content after ingredient list.");
      return ingredients;
    }
  }

  throw new Error("Ingredient list is not closed.");
}

export function normalizeIngredientName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim();
}

function parseMinutes(sourceValue: string): {
  minutes: number | null;
  reason: CookingTimeIssue["reason"] | null;
} {
  const trimmed = sourceValue.trim();
  if (trimmed === "") return { minutes: null, reason: "missing" };
  if (!/^\d+$/u.test(trimmed)) return { minutes: null, reason: "invalid" };

  const minutes = Number(trimmed);
  if (!Number.isSafeInteger(minutes)) return { minutes: null, reason: "invalid" };
  return { minutes, reason: null };
}

function requiredValue(row: RawRecipeRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Recipe row is missing required ${column} value.`);
  }
  return value.trim();
}

export function prepareRecipeRow(row: RawRecipeRow): PreparedRecipeRow {
  const id = requiredValue(row, "id");
  const name = requiredValue(row, "name");
  const parsedMinutes = parseMinutes(row["minutes"] ?? "");
  const parsedIngredients = parseIngredientList(row["ingredients"] ?? "");
  const uniqueNames = new Set<string>();

  for (const rawName of parsedIngredients) {
    const normalizedName = normalizeIngredientName(rawName);
    if (normalizedName === "") {
      throw new Error(`Recipe ${id} contains an empty ingredient name.`);
    }
    uniqueNames.add(normalizedName);
  }

  const ingredientNames = [...uniqueNames].sort();
  return {
    recipe: {
      id,
      name,
      minutes: parsedMinutes.minutes,
    },
    ingredients: ingredientNames.map((ingredientName) => ({
      name: ingredientName,
      isStaple: STAPLE_INGREDIENTS.has(ingredientName),
    })),
    uses: ingredientNames.map((ingredientName) => ({
      recipeId: id,
      ingredientName,
    })),
    cookingTimeIssue:
      parsedMinutes.reason === null
        ? null
        : {
            recipeId: id,
            sourceValue: row["minutes"] ?? "",
            reason: parsedMinutes.reason,
          },
    isCookingTimeOutlier:
      parsedMinutes.reason === null && isCookingTimeOutlier(parsedMinutes.minutes),
  };
}
