import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { prepareDataset } from "../scripts/prepare-data-cli.js";

const fixturePath = new URL("./fixtures/RAW_recipes.csv", import.meta.url);

describe("prepareDataset", () => {
  it("writes deterministic graph CSVs and contributor-free diagnostics", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "recipe-graph-"));
    const outputPath = join(temporaryDirectory, "prepared");
    try {
      const summary = await prepareDataset(fixturePath.pathname, outputPath);
      const recipes = await readFile(join(outputPath, "recipes.csv"), "utf8");
      const ingredients = await readFile(join(outputPath, "ingredients.csv"), "utf8");
      const uses = await readFile(join(outputPath, "recipe_ingredients.csv"), "utf8");
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
      expect(uses).toContain("2,scallion\n");
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
        ingredients: 6,
        uses: 6,
        missingCookingTimes: 1,
        invalidCookingTimes: 0,
        cookingTimeOutliers: 1,
        outlierThresholdMinutes: 132.5,
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
