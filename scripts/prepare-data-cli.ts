import { createReadStream, createWriteStream } from "node:fs";
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
import { prepareRecipeRow, type RawRecipeRow } from "./prepare-data.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = join(PROJECT_ROOT, "data", "raw", "RAW_recipes.csv");
const DEFAULT_OUTPUT = join(PROJECT_ROOT, "data", "prepared");
const REQUIRED_COLUMNS = ["name", "id", "minutes", "tags", "ingredients"];
const OUTPUT_FILES = [
  "recipes.csv",
  "ingredients.csv",
  "recipe_ingredients.csv",
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

export async function prepareDataset(
  inputPath: string = DEFAULT_INPUT,
  outputPath: string = DEFAULT_OUTPUT,
): Promise<PreparationSummary> {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  const temporaryDirectory = await mkdtemp(join(dirname(output), ".recipe-prep-"));
  const outputStreams = {
    recipes: createWriteStream(join(temporaryDirectory, "recipes.csv")),
    ingredients: createWriteStream(join(temporaryDirectory, "ingredients.csv")),
    uses: createWriteStream(join(temporaryDirectory, "recipe_ingredients.csv")),
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
    missingCookingTimes: 0,
    invalidCookingTimes: 0,
    cookingTimeOutliers: 0,
    outlierThresholdMinutes: COOKING_TIME_OUTLIER_THRESHOLD_MINUTES,
  };
  const ingredientStaples = new Map<string, boolean>();
  const recipeIds = new Set<string>();

  try {
    await Promise.all([
      writeCsvRow(outputStreams.recipes, ["id", "name", "minutes"]),
      writeCsvRow(outputStreams.ingredients, ["name", "isStaple"]),
      writeCsvRow(outputStreams.uses, ["recipeId", "ingredientName"]),
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

      summary.recipes += 1;
      await writeCsvRow(outputStreams.recipes, [
        prepared.recipe.id,
        prepared.recipe.name,
        prepared.recipe.minutes,
      ]);

      for (const ingredient of prepared.ingredients) {
        ingredientStaples.set(
          ingredient.name,
          ingredientStaples.get(ingredient.name) === true || ingredient.isStaple,
        );
      }
      for (const use of prepared.uses) {
        summary.uses += 1;
        await writeCsvRow(outputStreams.uses, [use.recipeId, use.ingredientName]);
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

    for (const [name, isStaple] of [...ingredientStaples.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      await writeCsvRow(outputStreams.ingredients, [name, isStaple]);
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

function parseArguments(args: string[]): { input: string; output: string } {
  let input = DEFAULT_INPUT;
  let output = DEFAULT_OUTPUT;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--input" && args[index + 1] !== undefined) {
      input = args[index + 1] ?? input;
      index += 1;
    } else if (argument === "--output" && args[index + 1] !== undefined) {
      output = args[index + 1] ?? output;
      index += 1;
    } else if (argument === "--help") {
      console.log(
        "Usage: npm run prepare:data -- [--input RAW_recipes.csv] [--output data/prepared]",
      );
      return { input: "", output: "" };
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument ?? ""}`);
    }
  }
  return { input, output };
}

async function main(args: string[]): Promise<void> {
  const options = parseArguments(args);
  if (options.input === "" && options.output === "") return;
  const summary = await prepareDataset(options.input, options.output);
  console.log(`Prepared ${summary.recipes} recipes and ${summary.ingredients} ingredients.`);
  console.log(`Wrote graph CSVs and reports to ${resolve(options.output)}.`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown preparation failure.";
    console.error(`Data preparation failed: ${message}`);
    process.exitCode = 1;
  });
}
