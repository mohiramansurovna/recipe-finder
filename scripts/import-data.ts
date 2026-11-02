import { createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import neo4j from "neo4j-driver";
import type { Driver, Session } from "neo4j-driver";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA_DIRECTORY = join(PROJECT_ROOT, "data", "prepared");
const BATCH_SIZE = 1000;
const SUPPORTED_INGREDIENT_CATEGORIES = new Set([
  "dairy",
  "fish/seafood",
  "meat",
  "nuts",
]);

export interface PreparedDataCounts {
  recipes: number;
  ingredients: number;
  uses: number;
  aliases: number;
  ingredientCategories: number;
  recipeCuisines: number;
}

export interface ImportConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
}

type CsvRow = Readonly<Record<string, string>>;

async function* readCsvRows(
  filePath: string,
  requiredColumns: readonly string[],
): AsyncGenerator<CsvRow> {
  let headersValidated = false;
  const parser = parse({
    bom: true,
    columns: (headers: string[]) => {
      const missing = requiredColumns.filter((column) => !headers.includes(column));
      if (missing.length > 0) {
        throw new Error(
          `${filePath} is missing required columns: ${missing.join(", ")}.`,
        );
      }
      headersValidated = true;
      return headers;
    },
    skip_empty_lines: true,
  });
  const input = createReadStream(filePath);
  input.on("error", (error: Error) => parser.destroy(error));
  input.pipe(parser);

  for await (const record of parser) {
    yield record as CsvRow;
  }
  if (!headersValidated) throw new Error(`${filePath} is empty or missing its header row.`);
}

function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function parseMinutes(value: string | undefined, rowNumber: number): number | null {
  if (value === undefined || value === "") return null;
  if (!/^\d+$/u.test(value)) {
    throw new Error(`recipes.csv row ${rowNumber} has an invalid minutes value.`);
  }
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes)) {
    throw new Error(`recipes.csv row ${rowNumber} has an unsafe minutes value.`);
  }
  return minutes;
}

export function assertFreshGraph(nodeCount: number): void {
  if (!Number.isSafeInteger(nodeCount) || nodeCount < 0) {
    throw new Error("Neo4j returned an invalid node count.");
  }
  if (nodeCount !== 0) {
    throw new Error(
      "Target Neo4j database is not empty. Import requires a fresh database.",
    );
  }
}

export async function validatePreparedData(
  directory: string = DEFAULT_DATA_DIRECTORY,
): Promise<PreparedDataCounts> {
  const dataDirectory = resolve(directory);
  const recipeIds = new Set<string>();
  const ingredientNames = new Set<string>();
  const aliasNames = new Set<string>();
  const counts: PreparedDataCounts = {
    recipes: 0,
    ingredients: 0,
    uses: 0,
    aliases: 0,
    ingredientCategories: 0,
    recipeCuisines: 0,
  };

  for await (const row of readCsvRows(join(dataDirectory, "recipes.csv"), [
    "id",
    "name",
    "minutes",
  ])) {
    counts.recipes += 1;
    if (!isNonEmpty(row["id"]) || !isNonEmpty(row["name"])) {
      throw new Error(`recipes.csv row ${counts.recipes + 1} has an empty id or name.`);
    }
    if (recipeIds.has(row["id"])) {
      throw new Error(`recipes.csv contains duplicate recipe id ${row["id"]}.`);
    }
    parseMinutes(row["minutes"], counts.recipes + 1);
    recipeIds.add(row["id"]);
  }

  for await (const row of readCsvRows(join(dataDirectory, "ingredients.csv"), [
    "name",
    "isStaple",
  ])) {
    counts.ingredients += 1;
    if (!isNonEmpty(row["name"])) {
      throw new Error(`ingredients.csv row ${counts.ingredients + 1} has an empty name.`);
    }
    if (ingredientNames.has(row["name"])) {
      throw new Error(`ingredients.csv contains duplicate ingredient ${row["name"]}.`);
    }
    if (row["isStaple"] !== "true" && row["isStaple"] !== "false") {
      throw new Error(
        `ingredients.csv row ${counts.ingredients + 1} has an invalid isStaple value.`,
      );
    }
    ingredientNames.add(row["name"]);
  }

  for await (const row of readCsvRows(
    join(dataDirectory, "recipe_ingredients.csv"),
    ["recipeId", "ingredientName"],
  )) {
    counts.uses += 1;
    if (!recipeIds.has(row["recipeId"] ?? "")) {
      throw new Error(
        `recipe_ingredients.csv row ${counts.uses + 1} references an unknown recipe.`,
      );
    }
    if (!ingredientNames.has(row["ingredientName"] ?? "")) {
      throw new Error(
        `recipe_ingredients.csv row ${counts.uses + 1} references an unknown ingredient.`,
      );
    }
  }

  for await (const row of readCsvRows(
    join(dataDirectory, "ingredient_aliases.csv"),
    ["alias", "canonicalName"],
  )) {
    counts.aliases += 1;
    const alias = row["alias"];
    const canonicalName = row["canonicalName"];
    if (!isNonEmpty(alias) || !isNonEmpty(canonicalName)) {
      throw new Error(
        `ingredient_aliases.csv row ${counts.aliases + 1} has an empty alias or canonical name.`,
      );
    }
    if (alias === canonicalName) {
      throw new Error(`ingredient_aliases.csv contains a self-alias for ${alias}.`);
    }
    if (aliasNames.has(alias)) {
      throw new Error(`ingredient_aliases.csv contains duplicate alias ${alias}.`);
    }
    if (!ingredientNames.has(canonicalName)) {
      throw new Error(
        `ingredient_aliases.csv row ${counts.aliases + 1} references an unknown canonical ingredient.`,
      );
    }
    if (ingredientNames.has(alias)) {
      throw new Error(
        `ingredient_aliases.csv row ${counts.aliases + 1} uses a canonical ingredient as an alias.`,
      );
    }
    aliasNames.add(alias);
  }

  const ingredientCategoryKeys = new Set<string>();
  for await (const row of readCsvRows(
    join(dataDirectory, "ingredient_categories.csv"),
    ["ingredientName", "category"],
  )) {
    counts.ingredientCategories += 1;
    const ingredientName = row["ingredientName"];
    const category = row["category"];
    if (!isNonEmpty(ingredientName) || !isNonEmpty(category)) {
      throw new Error(
        `ingredient_categories.csv row ${counts.ingredientCategories + 1} has an empty ingredient or category.`,
      );
    }
    if (!ingredientNames.has(ingredientName)) {
      throw new Error(
        `ingredient_categories.csv row ${counts.ingredientCategories + 1} references an unknown ingredient.`,
      );
    }
    if (!SUPPORTED_INGREDIENT_CATEGORIES.has(category)) {
      throw new Error(
        `ingredient_categories.csv row ${counts.ingredientCategories + 1} has an unsupported category.`,
      );
    }
    const key = `${ingredientName}\u0000${category}`;
    if (ingredientCategoryKeys.has(key)) {
      throw new Error(`ingredient_categories.csv contains a duplicate category mapping.`);
    }
    ingredientCategoryKeys.add(key);
  }

  const recipeCuisineKeys = new Set<string>();
  for await (const row of readCsvRows(
    join(dataDirectory, "recipe_cuisines.csv"),
    ["recipeId", "cuisineName"],
  )) {
    counts.recipeCuisines += 1;
    const recipeId = row["recipeId"];
    const cuisineName = row["cuisineName"];
    if (!isNonEmpty(recipeId) || !isNonEmpty(cuisineName)) {
      throw new Error(
        `recipe_cuisines.csv row ${counts.recipeCuisines + 1} has an empty recipe ID or cuisine name.`,
      );
    }
    if (!recipeIds.has(recipeId)) {
      throw new Error(
        `recipe_cuisines.csv row ${counts.recipeCuisines + 1} references an unknown recipe.`,
      );
    }
    if (recipeCuisineKeys.has(recipeId + "\u0000" + cuisineName)) {
      throw new Error(`recipe_cuisines.csv contains a duplicate cuisine mapping.`);
    }
    recipeCuisineKeys.add(recipeId + "\u0000" + cuisineName);
  }

  if (counts.recipes === 0 || counts.ingredients === 0) {
    throw new Error("Prepared data must contain at least one recipe and one ingredient.");
  }
  return counts;
}

async function checkDatabaseEmpty(session: Session): Promise<void> {
  const result = await session.run("MATCH (n) RETURN count(n) AS nodeCount");
  const record = result.records[0];
  if (record === undefined) throw new Error("Neo4j did not return a node count.");

  const value: unknown = record.get("nodeCount");
  const nodeCount =
    typeof value === "number"
      ? value
      : neo4j.isInt(value)
        ? value.toNumber()
        : Number.NaN;
  assertFreshGraph(nodeCount);
}

async function runBatched<T>(
  rows: AsyncIterable<T>,
  writeBatch: (batch: T[]) => Promise<void>,
): Promise<void> {
  let batch: T[] = [];
  for await (const row of rows) {
    batch.push(row);
    if (batch.length === BATCH_SIZE) {
      await writeBatch(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await writeBatch(batch);
}

async function* recipeRows(directory: string): AsyncGenerator<{
  id: string;
  name: string;
  minutes: number | null;
}> {
  let rowNumber = 1;
  for await (const row of readCsvRows(join(directory, "recipes.csv"), [
    "id",
    "name",
    "minutes",
  ])) {
    rowNumber += 1;
    yield {
      id: row["id"] ?? "",
      name: row["name"] ?? "",
      minutes: parseMinutes(row["minutes"], rowNumber),
    };
  }
}

async function* ingredientRows(directory: string): AsyncGenerator<{
  name: string;
  isStaple: boolean;
}> {
  for await (const row of readCsvRows(join(directory, "ingredients.csv"), [
    "name",
    "isStaple",
  ])) {
    yield {
      name: row["name"] ?? "",
      isStaple: row["isStaple"] === "true",
    };
  }
}

async function* useRows(directory: string): AsyncGenerator<{
  recipeId: string;
  ingredientName: string;
}> {
  for await (const row of readCsvRows(
    join(directory, "recipe_ingredients.csv"),
    ["recipeId", "ingredientName"],
  )) {
    yield {
      recipeId: row["recipeId"] ?? "",
      ingredientName: row["ingredientName"] ?? "",
    };
  }
}

async function* aliasRows(directory: string): AsyncGenerator<{
  alias: string;
  canonicalName: string;
}> {
  for await (const row of readCsvRows(
    join(directory, "ingredient_aliases.csv"),
    ["alias", "canonicalName"],
  )) {
    yield {
      alias: row["alias"] ?? "",
      canonicalName: row["canonicalName"] ?? "",
    };
  }
}

async function* aliasNodeRows(directory: string): AsyncGenerator<{ alias: string }> {
  for await (const row of aliasRows(directory)) {
    yield { alias: row.alias };
  }
}

async function* ingredientCategoryRows(
  directory: string,
): AsyncGenerator<{ ingredientName: string; category: string }> {
  for await (const row of readCsvRows(
    join(directory, "ingredient_categories.csv"),
    ["ingredientName", "category"],
  )) {
    yield {
      ingredientName: row["ingredientName"] ?? "",
      category: row["category"] ?? "",
    };
  }
}

async function* recipeCuisineRows(
  directory: string,
): AsyncGenerator<{ recipeId: string; cuisineName: string }> {
  for await (const row of readCsvRows(
    join(directory, "recipe_cuisines.csv"),
    ["recipeId", "cuisineName"],
  )) {
    yield {
      recipeId: row["recipeId"] ?? "",
      cuisineName: row["cuisineName"] ?? "",
    };
  }
}

async function writeRecipeBatch(session: Session, rows: {
  id: string;
  name: string;
  minutes: number | null;
}[]): Promise<void> {
  await session.run(
    `UNWIND $rows AS row
     MERGE (recipe:Recipe {id: row.id})
     SET recipe.name = row.name
     FOREACH (_ IN CASE WHEN row.minutes IS NULL THEN [] ELSE [1] END |
       SET recipe.minutes = row.minutes)`,
    { rows },
  );
}

async function writeIngredientBatch(
  session: Session,
  rows: { name: string; isStaple: boolean }[],
): Promise<void> {
  await session.run(
    `UNWIND $rows AS row
     MERGE (ingredient:Ingredient {name: row.name})
     SET ingredient.isStaple = row.isStaple`,
    { rows },
  );
}

async function writeUseBatch(
  session: Session,
  rows: { recipeId: string; ingredientName: string }[],
): Promise<void> {
  await session.run(
    `UNWIND $rows AS row
     MATCH (recipe:Recipe {id: row.recipeId})
     MATCH (ingredient:Ingredient {name: row.ingredientName})
     MERGE (recipe)-[:USES]->(ingredient)`,
    { rows },
  );
}

async function writeAliasNodeBatch(
  session: Session,
  rows: { alias: string }[],
): Promise<void> {
  await session.run(
    `UNWIND $rows AS row
     MERGE (alias:Ingredient {name: row.alias})
     SET alias.isStaple = false`,
    { rows },
  );
}

async function writeAliasRelationshipBatch(
  session: Session,
  rows: { alias: string; canonicalName: string }[],
): Promise<void> {
  await session.run(
    `UNWIND $rows AS row
     MATCH (alias:Ingredient {name: row.alias})
     MATCH (canonical:Ingredient {name: row.canonicalName})
     MERGE (alias)-[:ALIAS_OF]->(canonical)`,
    { rows },
  );
}

async function writeIngredientCategoryBatch(
  session: Session,
  rows: { ingredientName: string; category: string }[],
): Promise<void> {
  await session.run(
    `UNWIND $rows AS row
     MATCH (ingredient:Ingredient {name: row.ingredientName})
     MERGE (category:IngredientCategory {name: row.category})
     MERGE (ingredient)-[:IN_CATEGORY]->(category)`,
    { rows },
  );
}

async function writeRecipeCuisineBatch(
  session: Session,
  rows: { recipeId: string; cuisineName: string }[],
): Promise<void> {
  await session.run(
    `UNWIND $rows AS row
     MATCH (recipe:Recipe {id: row.recipeId})
     MERGE (cuisine:Cuisine {name: row.cuisineName})
     MERGE (recipe)-[:IN_CUISINE]->(cuisine)`,
    { rows },
  );
}

export async function importPreparedData(
  directory: string,
  config: ImportConfig,
  driver?: Driver,
): Promise<PreparedDataCounts> {
  const dataDirectory = resolve(directory);
  const counts = await validatePreparedData(dataDirectory);
  const activeDriver =
    driver ??
    neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
    );
  const session = activeDriver.session({ database: config.database });
  try {
    await checkDatabaseEmpty(session);
    await session.run(
      "CREATE CONSTRAINT recipe_id_unique IF NOT EXISTS FOR (recipe:Recipe) REQUIRE recipe.id IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT ingredient_name_unique IF NOT EXISTS FOR (ingredient:Ingredient) REQUIRE ingredient.name IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT ingredient_category_name_unique IF NOT EXISTS FOR (category:IngredientCategory) REQUIRE category.name IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT cuisine_name_unique IF NOT EXISTS FOR (cuisine:Cuisine) REQUIRE cuisine.name IS UNIQUE",
    );

    await runBatched(recipeRows(dataDirectory), (batch) =>
      writeRecipeBatch(session, batch),
    );
    await runBatched(ingredientRows(dataDirectory), (batch) =>
      writeIngredientBatch(session, batch),
    );
    await runBatched(aliasNodeRows(dataDirectory), (batch) =>
      writeAliasNodeBatch(session, batch),
    );
    await runBatched(useRows(dataDirectory), (batch) => writeUseBatch(session, batch));
    await runBatched(aliasRows(dataDirectory), (batch) =>
      writeAliasRelationshipBatch(session, batch),
    );
    await runBatched(ingredientCategoryRows(dataDirectory), (batch) =>
      writeIngredientCategoryBatch(session, batch),
    );
    await runBatched(recipeCuisineRows(dataDirectory), (batch) =>
      writeRecipeCuisineBatch(session, batch),
    );
  } finally {
    await Promise.all([session.close(), activeDriver.close()]);
  }
  return counts;
}

function readConfig(): ImportConfig {
  const uri = process.env["NEO4J_URI"];
  const username = process.env["NEO4J_USER"];
  const password = process.env["NEO4J_PASSWORD"];
  if (!uri || !username || !password) {
    throw new Error("Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD in the environment.");
  }
  return {
    uri,
    username,
    password,
    database: process.env["NEO4J_DATABASE"] || "neo4j",
  };
}

async function main(args: string[]): Promise<void> {
  if (
    (args.length !== 0 && args.length !== 2) ||
    (args.length === 2 && args[0] !== "--data")
  ) {
    throw new Error("Usage: npm run import:data -- [--data data/prepared]");
  }
  const dataDirectory = args.length === 2 ? args[1] : DEFAULT_DATA_DIRECTORY;
  if (dataDirectory === undefined) {
    throw new Error("A prepared data directory is required after --data.");
  }
  const counts = await importPreparedData(dataDirectory, readConfig());
  console.log(
    `Imported ${counts.recipes} recipes, ${counts.ingredients} ingredients, ${counts.uses} USES relationships, ${counts.aliases} aliases, ${counts.ingredientCategories} ingredient categories, and ${counts.recipeCuisines} recipe cuisines.`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown import failure.";
    console.error(`Neo4j import failed: ${message}`);
    process.exitCode = 1;
  });
}
