import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
import { dirname, join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";

import { COOKING_TIME_OUTLIER_THRESHOLD_MINUTES } from "./cooking-time.js";
import {
  normalizeIngredientName,
  parseIngredientList,
  prepareRecipeRow,
  type RawRecipeRow,
} from "./prepare-data.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = join(PROJECT_ROOT, "data", "raw", "RAW_recipes.csv");
const DEFAULT_INTERACTIONS = join(PROJECT_ROOT, "data", "raw", "RAW_interactions.csv");
const DEFAULT_OUTPUT = join(PROJECT_ROOT, "data", "prepared");
const DEFAULT_ALIAS_SOURCE = join(PROJECT_ROOT, "data", "ingredient-aliases.csv");
const DEFAULT_CATEGORY_SOURCE = join(PROJECT_ROOT, "data", "ingredient-categories.csv");
const DEFAULT_CUISINE_SOURCE = join(PROJECT_ROOT, "data", "cuisine-tags.csv");
const REQUIRED_COLUMNS = ["name", "id", "minutes", "tags", "ingredients"];
const SUPPORTED_INGREDIENT_CATEGORIES = new Set([
  "dairy",
  "fish/seafood",
  "meat",
  "nuts",
]);
const OUTPUT_FILES = [
  "recipes.csv",
  "ratings.csv",
  "ingredients.csv",
  "recipe_ingredients.csv",
  "ingredient_aliases.csv",
  "ingredient_categories.csv",
  "recipe_cuisines.csv",
  "cooking_time_issues.csv",
  "cooking_time_outliers.csv",
  "invalid_recipes.csv",
  "summary.json",
] as const;

interface PreparationSummary {
  sourceRecords: number;
  recipes: number;
  excludedRecipes: number;
  ingredients: number;
  uses: number;
  ingredientCategories: number;
  recipeCuisines: number;
  ratings: number;
  missingCookingTimes: number;
  invalidCookingTimes: number;
  cookingTimeOutliers: number;
  outlierThresholdMinutes: number;
}

function csvField(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsvRow(
  output: NodeJS.WritableStream,
  values: readonly (string | number | boolean | null)[],
): Promise<void> {
  const line = `${values.map(csvField).join(",")}\n`;
  if (!output.write(line)) await once(output, "drain");
}

function assertRequiredColumns(headers: string[]): string[] {
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(
      `RAW_recipes.csv is missing required columns: ${missing.join(", ")}.`,
    );
  }
  return headers;
}

async function loadIngredientAliases(sourcePath: string): Promise<Map<string, string>> {
  let headersValidated = false;
  const aliases = new Map<string, string>();
  const parser = parse({
    bom: true,
    columns: (headers: string[]) => {
      const requiredColumns = ["alias", "canonicalName"];
      const missing = requiredColumns.filter((column) => !headers.includes(column));
      if (missing.length > 0) {
        throw new Error(
          `${sourcePath} is missing required columns: ${missing.join(", ")}.`,
        );
      }
      headersValidated = true;
      return headers;
    },
    skip_empty_lines: true,
  });
  const input = createReadStream(sourcePath);
  input.on("error", (error: Error) => parser.destroy(error));
  input.pipe(parser);

  for await (const sourceRow of parser) {
    const row = sourceRow as Record<string, string>;
    const alias = normalizeIngredientName(row["alias"] ?? "");
    const canonicalName = normalizeIngredientName(row["canonicalName"] ?? "");
    if (alias === "" || canonicalName === "") {
      throw new Error(`${sourcePath} contains an empty ingredient alias or canonical name.`);
    }
    if (alias === canonicalName) {
      throw new Error(`${sourcePath} contains a self-alias for ${alias}.`);
    }
    const existingTarget = aliases.get(alias);
    if (existingTarget !== undefined && existingTarget !== canonicalName) {
      throw new Error(`${sourcePath} maps alias ${alias} to conflicting canonical names.`);
    }
    aliases.set(alias, canonicalName);
  }
  if (!headersValidated) throw new Error(`${sourcePath} is empty or missing its header row.`);

  for (const [alias, canonicalName] of aliases) {
    if (aliases.has(canonicalName)) {
      throw new Error(
        `${sourcePath} contains an alias chain or cycle through ${alias} and ${canonicalName}.`,
      );
    }
  }
  return aliases;
}

async function loadIngredientCategories(
  sourcePath: string,
): Promise<Map<string, Set<string>>> {
  let headersValidated = false;
  const categories = new Map<string, Set<string>>();
  const parser = parse({
    bom: true,
    columns: (headers: string[]) => {
      const requiredColumns = ["ingredientName", "category"];
      const missing = requiredColumns.filter((column) => !headers.includes(column));
      if (missing.length > 0) {
        throw new Error(
          `${sourcePath} is missing required columns: ${missing.join(", ")}.`,
        );
      }
      headersValidated = true;
      return headers;
    },
    skip_empty_lines: true,
  });
  const input = createReadStream(sourcePath);
  input.on("error", (error: Error) => parser.destroy(error));
  input.pipe(parser);

  for await (const sourceRow of parser) {
    const row = sourceRow as Record<string, string>;
    const ingredientName = normalizeIngredientName(row["ingredientName"] ?? "");
    const category = (row["category"] ?? "").trim().toLowerCase();
    if (ingredientName === "" || category === "") {
      throw new Error(`${sourcePath} contains an empty ingredient name or category.`);
    }
    if (!SUPPORTED_INGREDIENT_CATEGORIES.has(category)) {
      throw new Error(`${sourcePath} contains unsupported ingredient category ${category}.`);
    }
    const names = categories.get(ingredientName) ?? new Set<string>();
    if (names.has(category)) {
      throw new Error(
        `${sourcePath} contains duplicate category ${category} for ${ingredientName}.`,
      );
    }
    names.add(category);
    categories.set(ingredientName, names);
  }
  if (!headersValidated) throw new Error(`${sourcePath} is empty or missing its header row.`);
  return categories;
}

async function loadCuisineTags(sourcePath: string): Promise<Map<string, string>> {
  let headersValidated = false;
  const cuisines = new Map<string, string>();
  const parser = parse({
    bom: true,
    columns: (headers: string[]) => {
      const requiredColumns = ["sourceTag", "cuisineName"];
      const missing = requiredColumns.filter((column) => !headers.includes(column));
      if (missing.length > 0) {
        throw new Error(
          `${sourcePath} is missing required columns: ${missing.join(", ")}.`,
        );
      }
      headersValidated = true;
      return headers;
    },
    skip_empty_lines: true,
  });
  const input = createReadStream(sourcePath);
  input.on("error", (error: Error) => parser.destroy(error));
  input.pipe(parser);

  for await (const sourceRow of parser) {
    const row = sourceRow as Record<string, string>;
    const sourceTag = normalizeIngredientName(row["sourceTag"] ?? "");
    const cuisineName = row["cuisineName"]?.trim() ?? "";
    if (sourceTag === "" || cuisineName === "") {
      throw new Error(`${sourcePath} contains an empty source tag or cuisine name.`);
    }
    if (cuisines.has(sourceTag)) {
      throw new Error(`${sourcePath} contains duplicate cuisine mapping for ${sourceTag}.`);
    }
    cuisines.set(sourceTag, cuisineName);
  }
  if (!headersValidated) throw new Error(`${sourcePath} is empty or missing its header row.`);
  return cuisines;
}

export async function prepareDataset(
  inputPath: string = DEFAULT_INPUT,
  outputPath: string = DEFAULT_OUTPUT,
  aliasSourcePath: string = DEFAULT_ALIAS_SOURCE,
  categorySourcePath: string = DEFAULT_CATEGORY_SOURCE,
  cuisineSourcePath: string = DEFAULT_CUISINE_SOURCE,
  interactionsPath?: string,
): Promise<PreparationSummary> {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  const interactions = resolve(interactionsPath ?? DEFAULT_INTERACTIONS);
  if (interactionsPath !== undefined && !existsSync(interactions)) {
    throw new Error(`Rating source file ${interactions} does not exist.`);
  }
  const hasInteractions = existsSync(interactions);
  const aliasSource = resolve(aliasSourcePath);
  const aliases = await loadIngredientAliases(aliasSource);
  const ingredientCategories = await loadIngredientCategories(resolve(categorySourcePath));
  const cuisineTags = await loadCuisineTags(resolve(cuisineSourcePath));
  const temporaryDirectory = await mkdtemp(join(dirname(output), ".recipe-prep-"));
  const outputStreams = {
    recipes: createWriteStream(join(temporaryDirectory, "recipes.csv")),
    ratings: createWriteStream(join(temporaryDirectory, "ratings.csv")),
    ingredients: createWriteStream(join(temporaryDirectory, "ingredients.csv")),
    uses: createWriteStream(join(temporaryDirectory, "recipe_ingredients.csv")),
    aliases: createWriteStream(join(temporaryDirectory, "ingredient_aliases.csv")),
    categories: createWriteStream(join(temporaryDirectory, "ingredient_categories.csv")),
    cuisines: createWriteStream(join(temporaryDirectory, "recipe_cuisines.csv")),
    issues: createWriteStream(join(temporaryDirectory, "cooking_time_issues.csv")),
    outliers: createWriteStream(join(temporaryDirectory, "cooking_time_outliers.csv")),
    invalidRecipes: createWriteStream(join(temporaryDirectory, "invalid_recipes.csv")),
  };
  let outputError: Error | null = null;
  for (const stream of Object.values(outputStreams)) {
    stream.on("error", (error: Error) => {
      outputError = error;
    });
  }

  const summary: PreparationSummary = {
    sourceRecords: 0,
    recipes: 0,
    excludedRecipes: 0,
    ingredients: 0,
    uses: 0,
    ingredientCategories: 0,
    recipeCuisines: 0,
    ratings: 0,
    missingCookingTimes: 0,
    invalidCookingTimes: 0,
    cookingTimeOutliers: 0,
    outlierThresholdMinutes: COOKING_TIME_OUTLIER_THRESHOLD_MINUTES,
  };
  const ingredientStaples = new Map<string, boolean>();
  const recipeIds = new Set<string>();
  const preparedRecipeIds = new Set<string>();
  const recipeCuisines = new Map<string, Set<string>>();

  try {
    await Promise.all([
      writeCsvRow(outputStreams.recipes, [
        "id",
        "name",
        "minutes",
        "instructions",
        "aggregateRating",
      ]),
      writeCsvRow(outputStreams.ratings, ["recipeId", "rating"]),
      writeCsvRow(outputStreams.ingredients, ["name", "isStaple"]),
      writeCsvRow(outputStreams.uses, ["recipeId", "ingredientName"]),
      writeCsvRow(outputStreams.aliases, ["alias", "canonicalName"]),
      writeCsvRow(outputStreams.categories, ["ingredientName", "category"]),
      writeCsvRow(outputStreams.cuisines, ["recipeId", "cuisineName"]),
      writeCsvRow(outputStreams.issues, ["recipeId", "sourceValue", "reason"]),
      writeCsvRow(outputStreams.outliers, ["recipeId", "minutes"]),
      writeCsvRow(outputStreams.invalidRecipes, ["recipeId", "sourceRecord", "reason"]),
    ]);

    let headersValidated = false;
    const parser = parse({
      bom: true,
      columns: (headers: string[]) => {
        headersValidated = true;
        return assertRequiredColumns(headers);
      },
      skip_empty_lines: true,
    });
    const inputStream = createReadStream(input);
    inputStream.on("error", (error: Error) => parser.destroy(error));
    inputStream.pipe(parser);

    for await (const sourceRow of parser) {
      const row = sourceRow as RawRecipeRow;
      summary.sourceRecords += 1;
      const sourceRecord = summary.sourceRecords;
      const recipeId = (row["id"] ?? "").trim();
      if (recipeId === "") {
        throw new Error(`Source record ${sourceRecord} has no recipe id.`);
      }
      if (recipeIds.has(recipeId)) {
        throw new Error(`Duplicate recipe id ${recipeId} in source data.`);
      }
      recipeIds.add(recipeId);

      if ((row["name"] ?? "").trim() === "") {
        summary.excludedRecipes += 1;
        await writeCsvRow(outputStreams.invalidRecipes, [
          recipeId,
          sourceRecord,
          "missing_name",
        ]);
        continue;
      }

      let prepared;
      try {
        prepared = prepareRecipeRow(row);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown row error.";
        throw new Error(`Unable to prepare source record ${sourceRecord}: ${detail}`, {
          cause: error,
        });
      }
      let sourceTags: string[];
      try {
        const rawTags = (row["tags"] ?? "").trim();
        sourceTags = rawTags === "" ? [] : parseIngredientList(rawTags);
      } catch (error) {
        throw new Error(`Unable to parse tags in source record ${sourceRecord}.`, {
          cause: error,
        });
      }

      summary.recipes += 1;
      preparedRecipeIds.add(prepared.recipe.id);
      await writeCsvRow(outputStreams.recipes, [
        prepared.recipe.id,
        prepared.recipe.name,
        prepared.recipe.minutes,
        prepared.recipe.instructions === null
          ? null
          : JSON.stringify(prepared.recipe.instructions),
        prepared.recipe.aggregateRating,
      ]);

      const recipeCuisineNames = new Set<string>();
      for (const sourceTag of sourceTags) {
        const cuisineName = cuisineTags.get(normalizeIngredientName(sourceTag));
        if (cuisineName !== undefined) recipeCuisineNames.add(cuisineName);
      }
      if (recipeCuisineNames.size > 0) {
        recipeCuisines.set(prepared.recipe.id, recipeCuisineNames);
      }

      for (const ingredient of prepared.ingredients) {
        const canonicalName = aliases.get(ingredient.name) ?? ingredient.name;
        ingredientStaples.set(
          canonicalName,
          ingredientStaples.get(canonicalName) === true || ingredient.isStaple,
        );
      }
      const recipeIngredientNames = new Set<string>();
      for (const use of prepared.uses) {
        const canonicalName = aliases.get(use.ingredientName) ?? use.ingredientName;
        if (recipeIngredientNames.has(canonicalName)) continue;
        recipeIngredientNames.add(canonicalName);
        summary.uses += 1;
        await writeCsvRow(outputStreams.uses, [use.recipeId, canonicalName]);
      }
      if (prepared.cookingTimeIssue !== null) {
        if (prepared.cookingTimeIssue.reason === "missing") {
          summary.missingCookingTimes += 1;
        } else {
          summary.invalidCookingTimes += 1;
        }
        await writeCsvRow(outputStreams.issues, [
          prepared.cookingTimeIssue.recipeId,
          prepared.cookingTimeIssue.sourceValue,
          prepared.cookingTimeIssue.reason,
        ]);
      }
      if (prepared.isCookingTimeOutlier) {
        summary.cookingTimeOutliers += 1;
        await writeCsvRow(outputStreams.outliers, [
          prepared.recipe.id,
          prepared.recipe.minutes,
        ]);
      }

      if (outputError !== null) throw outputError;
    }

    if (hasInteractions) {
      let headersValidated = false;
      const parser = parse({
        bom: true,
        columns: (headers: string[]) => {
          const requiredColumns = ["recipe_id", "rating"];
          const missing = requiredColumns.filter((column) => !headers.includes(column));
          if (missing.length > 0) {
            throw new Error(
              `${interactions} is missing required columns: ${missing.join(", ")}.`,
            );
          }
          headersValidated = true;
          return headers;
        },
        skip_empty_lines: true,
      });
      const inputStream = createReadStream(interactions);
      inputStream.on("error", (error: Error) => parser.destroy(error));
      inputStream.pipe(parser);

      for await (const sourceRow of parser) {
        const row = sourceRow as Record<string, string>;
        const recipeId = (row["recipe_id"] ?? "").trim();
        const ratingValue = (row["rating"] ?? "").trim();
        if (recipeId === "") {
          throw new Error(`${interactions} contains a rating without a recipe ID.`);
        }
        if (!recipeIds.has(recipeId)) {
          throw new Error(`${interactions} references unknown recipe ${recipeId}.`);
        }
        if (!/^\d+$/u.test(ratingValue)) {
          throw new Error(`${interactions} contains an invalid rating for recipe ${recipeId}.`);
        }
        const rating = Number(ratingValue);
        if (!Number.isSafeInteger(rating) || rating < 0 || rating > 5) {
          throw new Error(`${interactions} contains an invalid rating for recipe ${recipeId}.`);
        }
        if (rating === 0 || !preparedRecipeIds.has(recipeId)) continue;
        summary.ratings += 1;
        await writeCsvRow(outputStreams.ratings, [recipeId, rating]);
      }
      if (!headersValidated) {
        throw new Error(`${interactions} is empty or missing its header row.`);
      }
    }

    for (const [name, isStaple] of [...ingredientStaples.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      await writeCsvRow(outputStreams.ingredients, [name, isStaple]);
    }
    for (const [alias, canonicalName] of [...aliases.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (!ingredientStaples.has(canonicalName)) {
        throw new Error(
          `${alias} maps to ${canonicalName}, which is not present in the prepared ingredients.`,
        );
      }
      await writeCsvRow(outputStreams.aliases, [alias, canonicalName]);
    }
    const canonicalCategories = new Map<string, Set<string>>();
    for (const [ingredientName, categories] of ingredientCategories) {
      const canonicalName = aliases.get(ingredientName) ?? ingredientName;
      if (!ingredientStaples.has(canonicalName)) {
        throw new Error(
          `${ingredientName} in ${categorySourcePath} is not present in the prepared ingredients.`,
        );
      }
      const targetCategories = canonicalCategories.get(canonicalName) ?? new Set<string>();
      for (const category of categories) targetCategories.add(category);
      canonicalCategories.set(canonicalName, targetCategories);
    }
    for (const [ingredientName, categories] of [...canonicalCategories.entries()].sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    )) {
      for (const category of [...categories].sort()) {
        await writeCsvRow(outputStreams.categories, [ingredientName, category]);
        summary.ingredientCategories += 1;
      }
    }
    for (const [recipeId, cuisines] of [...recipeCuisines.entries()].sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    )) {
      for (const cuisineName of [...cuisines].sort()) {
        await writeCsvRow(outputStreams.cuisines, [recipeId, cuisineName]);
        summary.recipeCuisines += 1;
      }
    }
    summary.ingredients = ingredientStaples.size;
    if (!headersValidated) throw new Error("RAW_recipes.csv is empty or missing its header row.");

    for (const stream of Object.values(outputStreams)) stream.end();
    await Promise.all(Object.values(outputStreams).map((stream) => finished(stream)));
    if (outputError !== null) throw outputError;

    await writeFile(
      join(temporaryDirectory, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    await mkdir(output, { recursive: true });
    for (const file of OUTPUT_FILES) {
      await rename(join(temporaryDirectory, file), join(output, file));
    }
    return summary;
  } finally {
    for (const stream of Object.values(outputStreams)) {
      if (!stream.destroyed) stream.destroy();
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseArguments(args: string[]): {
  input: string;
  output: string;
  interactions?: string;
} {
  let input = DEFAULT_INPUT;
  let output = DEFAULT_OUTPUT;
  let interactions: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--input" && args[index + 1] !== undefined) {
      input = args[index + 1] ?? input;
      index += 1;
    } else if (argument === "--output" && args[index + 1] !== undefined) {
      output = args[index + 1] ?? output;
      index += 1;
    } else if (argument === "--interactions" && args[index + 1] !== undefined) {
      interactions = args[index + 1];
      index += 1;
    } else if (argument === "--help") {
      console.log(
        "Usage: npm run prepare:data -- [--input RAW_recipes.csv] [--interactions RAW_interactions.csv] [--output data/prepared]",
      );
      return { input: "", output: "" };
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument ?? ""}`);
    }
  }
  return interactions === undefined
    ? { input, output }
    : { input, output, interactions };
}

async function main(args: string[]): Promise<void> {
  const options = parseArguments(args);
  if (options.input === "" && options.output === "") return;
  const summary = await prepareDataset(
    options.input,
    options.output,
    undefined,
    undefined,
    undefined,
    options.interactions,
  );
  console.log(
    `Prepared ${summary.recipes} recipes, ${summary.ingredients} ingredients, and ${summary.ratings} individual ratings.`,
  );
  console.log(`Wrote graph CSVs and reports to ${resolve(options.output)}.`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown preparation failure.";
    console.error(`Data preparation failed: ${message}`);
    process.exitCode = 1;
  });
}
