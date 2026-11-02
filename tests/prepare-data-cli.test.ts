import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { prepareDataset } from "../scripts/prepare-data-cli.js";

const fixturePath = new URL("./fixtures/RAW_recipes.csv", import.meta.url);
const categoryFixturePath = new URL("./fixtures/ingredient-categories.csv", import.meta.url);
const cuisineFixturePath = new URL("./fixtures/cuisine-tags.csv", import.meta.url);

describe("prepareDataset", () => {
  it("writes deterministic graph CSVs and contributor-free diagnostics", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "recipe-graph-"));
    const outputPath = join(temporaryDirectory, "prepared");
    try {
      const summary = await prepareDataset(
        fixturePath.pathname,
        outputPath,
        undefined,
        categoryFixturePath.pathname,
        cuisineFixturePath.pathname,
      );
      const recipes = await readFile(join(outputPath, "recipes.csv"), "utf8");
      const ingredients = await readFile(join(outputPath, "ingredients.csv"), "utf8");
      const uses = await readFile(join(outputPath, "recipe_ingredients.csv"), "utf8");
      const aliases = await readFile(join(outputPath, "ingredient_aliases.csv"), "utf8");
      const categories = await readFile(join(outputPath, "ingredient_categories.csv"), "utf8");
      const cuisines = await readFile(join(outputPath, "recipe_cuisines.csv"), "utf8");
      const issues = await readFile(join(outputPath, "cooking_time_issues.csv"), "utf8");
      const outliers = await readFile(join(outputPath, "cooking_time_outliers.csv"), "utf8");
      const invalidRecipes = await readFile(join(outputPath, "invalid_recipes.csv"), "utf8");
      const report = await readFile(join(outputPath, "summary.json"), "utf8");

      expect(recipes).toBe(
        'id,name,minutes\n1,"Soup, ""simple""",15\n2,No time,\n3,Long,133\n',
      );
      expect(ingredients).toContain("olive oil,true");
      expect(ingredients).toContain("salt,true");
      expect(ingredients).toContain("pepper,false");
      expect(uses).toContain("2,green onion\n");
      expect(uses.match(/2,green onion\n/gu)).toHaveLength(1);
      expect(aliases).toBe(
        "alias,canonicalName\nscallion,green onion\nscallions,green onion\n",
      );
      expect(categories).toBe("ingredientName,category\nchicken,meat\n");
      expect(cuisines).toBe("recipeId,cuisineName\n1,Italian\n");
      expect(issues).toBe("recipeId,sourceValue,reason\n2,,missing\n");
      expect(outliers).toBe("recipeId,minutes\n3,133\n");
      expect(invalidRecipes).toBe("recipeId,sourceRecord,reason\n4,4,missing_name\n");
      expect(uses).not.toContain("not imported");
      expect(report).toContain('"recipes": 3');
      expect(report).not.toContain("contributor");
      expect(summary).toEqual({
        sourceRecords: 4,
        recipes: 3,
        excludedRecipes: 1,
        ingredients: 5,
        uses: 5,
        ingredientCategories: 1,
        recipeCuisines: 1,
        missingCookingTimes: 1,
        invalidCookingTimes: 0,
        cookingTimeOutliers: 1,
        outlierThresholdMinutes: 132.5,
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("normalizes curated alias names and rejects conflicting mappings", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "recipe-graph-aliases-"));
    try {
      const outputPath = join(temporaryDirectory, "prepared");
      const aliasPath = join(temporaryDirectory, "aliases.csv");
      await writeFile(aliasPath, "alias,canonicalName\n Scallion , Green Onion \n");

      await prepareDataset(
        fixturePath.pathname,
        outputPath,
        aliasPath,
        categoryFixturePath.pathname,
        cuisineFixturePath.pathname,
      );
      await expect(
        readFile(join(outputPath, "ingredient_aliases.csv"), "utf8"),
      ).resolves.toBe("alias,canonicalName\nscallion,green onion\n");

      await writeFile(
        aliasPath,
        "alias,canonicalName\nscallion,green onion\nscallion,pepper\n",
      );
      await expect(
        prepareDataset(
          fixturePath.pathname,
          join(temporaryDirectory, "conflicting"),
          aliasPath,
          categoryFixturePath.pathname,
          cuisineFixturePath.pathname,
        ),
      ).rejects.toThrow("conflicting canonical names");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("rejects unsupported categories and mappings for absent ingredients", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "recipe-graph-categories-"));
    try {
      const invalidCategoryPath = join(temporaryDirectory, "invalid-categories.csv");
      await writeFile(invalidCategoryPath, "ingredientName,category\nchicken,vegetarian\n");
      await expect(
        prepareDataset(
          fixturePath.pathname,
          join(temporaryDirectory, "unsupported"),
          undefined,
          invalidCategoryPath,
          cuisineFixturePath.pathname,
        ),
      ).rejects.toThrow("unsupported ingredient category vegetarian");

      await writeFile(
        invalidCategoryPath,
        "ingredientName,category\nnot present,dairy\n",
      );
      await expect(
        prepareDataset(
          fixturePath.pathname,
          join(temporaryDirectory, "unknown-ingredient"),
          undefined,
          invalidCategoryPath,
          cuisineFixturePath.pathname,
        ),
      ).rejects.toThrow("not present in the prepared ingredients");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("leaves ingredients and tags without curated classifications unclassified", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "recipe-graph-unclassified-"));
    const outputPath = join(temporaryDirectory, "prepared");
    try {
      await prepareDataset(
        fixturePath.pathname,
        outputPath,
        undefined,
        categoryFixturePath.pathname,
        cuisineFixturePath.pathname,
      );
      const categories = await readFile(join(outputPath, "ingredient_categories.csv"), "utf8");
      const cuisines = await readFile(join(outputPath, "recipe_cuisines.csv"), "utf8");
      expect(categories).not.toContain("pepper,");
      expect(cuisines).not.toContain("2,");
      expect(cuisines).not.toContain("3,");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("rejects duplicate cuisine-tag mappings", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "recipe-graph-cuisines-"));
    const cuisinePath = join(temporaryDirectory, "cuisines.csv");
    try {
      await writeFile(
        cuisinePath,
        "sourceTag,cuisineName\nitalian,Italian\nitalian,Italian\n",
      );
      await expect(
        prepareDataset(
          fixturePath.pathname,
          join(temporaryDirectory, "prepared"),
          undefined,
          categoryFixturePath.pathname,
          cuisinePath,
        ),
      ).rejects.toThrow("duplicate cuisine mapping for italian");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
