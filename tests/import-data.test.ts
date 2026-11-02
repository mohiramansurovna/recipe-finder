import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertFreshGraph,
  validatePreparedData,
} from "../scripts/import-data.js";

let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory !== null) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

async function makePreparedDirectory(): Promise<string> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "recipe-graph-import-"));
  const dataDirectory = join(temporaryDirectory, "prepared");
  await mkdir(dataDirectory);
  await Promise.all([
    writeFile(join(dataDirectory, "recipes.csv"), "id,name,minutes\n1,Soup,10\n"),
    writeFile(join(dataDirectory, "ingredients.csv"), "name,isStaple\nsalt,true\n"),
    writeFile(
      join(dataDirectory, "recipe_ingredients.csv"),
      "recipeId,ingredientName\n1,salt\n",
    ),
    writeFile(
      join(dataDirectory, "ingredient_aliases.csv"),
      "alias,canonicalName\nsea salt,salt\n",
    ),
    writeFile(
      join(dataDirectory, "ingredient_categories.csv"),
      "ingredientName,category\nsalt,dairy\n",
    ),
    writeFile(
      join(dataDirectory, "recipe_cuisines.csv"),
      "recipeId,cuisineName\n1,Italian\n",
    ),
  ]);
  return dataDirectory;
}

describe("fresh graph guard", () => {
  it("allows an empty target database", () => {
    expect(() => assertFreshGraph(0)).not.toThrow();
  });

  it("rejects a target containing any nodes before import writes", () => {
    expect(() => assertFreshGraph(1)).toThrow("requires a fresh database");
  });

  it("rejects an invalid node count", () => {
    expect(() => assertFreshGraph(Number.NaN)).toThrow("invalid node count");
  });
});

describe("prepared data validation", () => {
  it("validates node records and relationship references", async () => {
    const dataDirectory = await makePreparedDirectory();
    await expect(validatePreparedData(dataDirectory)).resolves.toEqual({
      recipes: 1,
      ingredients: 1,
      uses: 1,
      aliases: 1,
      ingredientCategories: 1,
      recipeCuisines: 1,
    });
  });

  it("rejects relationships to missing graph nodes", async () => {
    const dataDirectory = await makePreparedDirectory();
    await writeFile(
      join(dataDirectory, "recipe_ingredients.csv"),
      "recipeId,ingredientName\n1,missing\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "references an unknown ingredient",
    );
  });

  it("rejects duplicate recipe ids", async () => {
    const dataDirectory = await makePreparedDirectory();
    await writeFile(
      join(dataDirectory, "recipes.csv"),
      "id,name,minutes\n1,Soup,10\n1,Another soup,20\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "duplicate recipe id",
    );
  });

  it("rejects aliases that reference unknown canonical ingredients", async () => {
    const dataDirectory = await makePreparedDirectory();
    await writeFile(
      join(dataDirectory, "ingredient_aliases.csv"),
      "alias,canonicalName\nsea salt,pepper\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "unknown canonical ingredient",
    );
  });

  it("rejects invalid ingredient category data", async () => {
    const dataDirectory = await makePreparedDirectory();
    await writeFile(
      join(dataDirectory, "ingredient_categories.csv"),
      "ingredientName,category\nmissing,dairy\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "ingredient_categories.csv row 2 references an unknown ingredient",
    );

    await writeFile(
      join(dataDirectory, "ingredient_categories.csv"),
      "ingredientName,category\nsalt,vegetarian\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "has an unsupported category",
    );
  });

  it("rejects cuisine relationships to unknown recipes", async () => {
    const dataDirectory = await makePreparedDirectory();
    await writeFile(
      join(dataDirectory, "recipe_cuisines.csv"),
      "recipeId,cuisineName\nunknown,Italian\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "recipe_cuisines.csv row 2 references an unknown recipe",
    );
  });

  it("rejects duplicate aliases and alias chains", async () => {
    const dataDirectory = await makePreparedDirectory();
    await writeFile(
      join(dataDirectory, "ingredient_aliases.csv"),
      "alias,canonicalName\nsea salt,salt\nsea salt,salt\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "duplicate alias",
    );

    await writeFile(
      join(dataDirectory, "ingredients.csv"),
      "name,isStaple\nsalt,true\npepper,false\n",
    );
    await writeFile(
      join(dataDirectory, "ingredient_aliases.csv"),
      "alias,canonicalName\nsea salt,salt\nsalt,pepper\n",
    );
    await expect(validatePreparedData(dataDirectory)).rejects.toThrow(
      "canonical ingredient as an alias",
    );
  });
});
