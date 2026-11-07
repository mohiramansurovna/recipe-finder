import neo4j from "neo4j-driver";
import type { Driver, Record as Neo4jRecord } from "neo4j-driver";

import {
  compareRecipeSearchPositions,
  decodeRecipeSearchCursor,
  encodeRecipeSearchCursor,
  recipeSearchFingerprint,
} from "../recipe-search-cursor.js";
import type {
  RecipeSearchCriteria,
  RecipeDetail,
  RecipeSearchPage,
  RecipeSearchRecord,
} from "../recipe-search-types.js";
import { mapRecipeSearchResult } from "../recipe-search-types.js";
import type { RecipeSearchRepository } from "../ports/recipe-search-repository.js";

const PAGE_SIZE = 20;

const ELIGIBILITY_FILTERS = `
  ($maxMinutes IS NULL OR recipe.minutes <= $maxMinutes)
  AND NOT EXISTS {
    MATCH (recipe)-[:USES]->(:Ingredient)-[:IN_CATEGORY]->(category:IngredientCategory)
    WHERE category.name IN $excludedCategories
  }
  AND (
    size($cuisines) = 0
    OR EXISTS {
      MATCH (recipe)-[:IN_CUISINE]->(cuisine:Cuisine)
      WHERE cuisine.name IN $cuisines
    }
  )
`;

interface ScoredRecipeSearchRecord {
  recipe: RecipeSearchRecord;
  position: {
    missingCount: number;
    matchedCount: number;
    excludedCount: number;
    id: string;
  };
}

const COUNT_QUERY = `
MATCH (recipe:Recipe)
WHERE ${ELIGIBILITY_FILTERS}
RETURN count(recipe) AS totalCount
`;

const SEARCH_QUERY = `
MATCH (recipe:Recipe)
WHERE ${ELIGIBILITY_FILTERS}
OPTIONAL MATCH (recipe)-[:USES]->(ingredient:Ingredient)
WITH recipe, collect(DISTINCT ingredient.name) AS ingredientNames
WITH recipe, ingredientNames,
     [name IN ingredientNames WHERE name IN $included] AS matchedNames,
     [name IN ingredientNames WHERE NOT name IN $included] AS missingNames,
     [name IN ingredientNames WHERE name IN $excluded] AS excludedNames
WITH recipe, ingredientNames, matchedNames, missingNames, excludedNames,
     size(missingNames) AS missingCount,
     size(matchedNames) AS matchedCount,
     size(excludedNames) AS excludedCount
WHERE $cursorMissing IS NULL
   OR missingCount > $cursorMissing
   OR (missingCount = $cursorMissing AND matchedCount < $cursorMatched)
   OR (missingCount = $cursorMissing AND matchedCount = $cursorMatched
       AND excludedCount > $cursorExcluded)
   OR (missingCount = $cursorMissing AND matchedCount = $cursorMatched
       AND excludedCount = $cursorExcluded AND recipe.id > $cursorId)
RETURN recipe.id AS id, recipe.name AS name, recipe.minutes AS minutes,
       ingredientNames AS ingredientNames, missingCount AS missingCount,
       matchedCount AS matchedCount, excludedCount AS excludedCount
ORDER BY missingCount ASC, matchedCount DESC, excludedCount ASC, id ASC
LIMIT $limit
`;

const RECIPE_DETAIL_QUERY = `
MATCH (recipe:Recipe {id: $id})
CALL {
  WITH recipe
  OPTIONAL MATCH (recipe)-[:USES]->(ingredient:Ingredient)
  RETURN collect(DISTINCT ingredient.name) AS ingredients
}
CALL {
  WITH recipe
  OPTIONAL MATCH (recipe)-[:IN_CUISINE]->(cuisine:Cuisine)
  RETURN collect(DISTINCT cuisine.name) AS cuisines
}
CALL {
  WITH recipe
  OPTIONAL MATCH (recipe)-[:HAS_RATING]->(rating:Rating)
  RETURN collect(rating.value) AS individualRatings
}
RETURN recipe.id AS id, recipe.name AS name, recipe.minutes AS minutes,
       recipe.instructions AS instructions,
       recipe.aggregateRating AS aggregateRating,
       ingredients AS ingredients, cuisines AS cuisines,
       individualRatings AS individualRatings
`;

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Neo4j returned a recipe without a valid ${field}.`);
  }
  return value;
}

function readMinutes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const minutes = neo4j.isInt(value) ? value.toNumber() : value;
  if (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 0) {
    throw new Error("Neo4j returned a recipe with an invalid cooking time.");
  }
  return minutes;
}

function readIngredientNames(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((name) => typeof name === "string")) {
    throw new Error("Neo4j returned a recipe with invalid ingredient data.");
  }
  return value;
}

function readOptionalStrings(value: unknown, field: string): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Neo4j returned a recipe with invalid ${field}.`);
  }
  return value;
}

function readRating(value: unknown, field: string): number {
  const rating = neo4j.isInt(value) ? value.toNumber() : value;
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0 || rating > 5) {
    throw new Error(`Neo4j returned a recipe with an invalid ${field}.`);
  }
  return rating;
}

function readRatings(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Neo4j returned a recipe with invalid individual ratings.");
  }
  return value.map((rating) => readRating(rating, "individual rating"));
}

function readAggregateRating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return readRating(value, "aggregate rating");
}

function readTotalCount(record: Neo4jRecord | undefined): number {
  const value: unknown = record?.get("totalCount");
  const count = neo4j.isInt(value) ? value.toNumber() : value;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Neo4j returned an invalid recipe-search total count.");
  }
  return count;
}

export class Neo4jRecipeSearchRepository implements RecipeSearchRepository {
  constructor(
    private readonly driver: Driver,
    private readonly database: string,
  ) {}

  async getCuisineNames(): Promise<readonly string[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (cuisine:Cuisine)
         RETURN cuisine.name AS name
         ORDER BY name`,
      );
      return result.records.map((record) => readString(record.get("name"), "cuisine name"));
    } finally {
      await session.close();
    }
  }

  async search(criteria: RecipeSearchCriteria): Promise<RecipeSearchPage> {
    const fingerprint = recipeSearchFingerprint(criteria);
    const position =
      criteria.cursor === null
        ? null
        : decodeRecipeSearchCursor(criteria.cursor, fingerprint);
    const session = this.driver.session({ database: this.database });

    try {
      const filterParams = {
        excludedCategories: [...new Set(criteria.excludedCategories)],
        cuisines: [...new Set(criteria.cuisines)],
        maxMinutes: criteria.maxMinutes,
      };
      const countResult = await session.run(COUNT_QUERY, filterParams);
      const totalCount = readTotalCount(countResult.records[0]);
      const result = await session.run(SEARCH_QUERY, {
        included: [...new Set(criteria.included)],
        excluded: [...new Set(criteria.excluded)],
        ...filterParams,
        cursorMissing: position?.missingCount ?? null,
        cursorMatched: position?.matchedCount ?? null,
        cursorExcluded: position?.excludedCount ?? null,
        cursorId: position?.id ?? null,
        limit: neo4j.int(PAGE_SIZE + 1),
      });

      const records: ScoredRecipeSearchRecord[] = result.records.map((record) => {
        const id = readString(record.get("id"), "id");
        return {
          recipe: {
            id,
            name: readString(record.get("name"), "name"),
            minutes: readMinutes(record.get("minutes")),
            ingredientNames: readIngredientNames(record.get("ingredientNames")),
          },
          position: {
            id,
            missingCount: readScore(record, "missingCount"),
            matchedCount: readScore(record, "matchedCount"),
            excludedCount: readScore(record, "excludedCount"),
          },
        };
      });

      for (let index = 1; index < records.length; index += 1) {
        const previous = records[index - 1];
        const current = records[index];
        if (
          previous !== undefined &&
          current !== undefined &&
          compareRecipeSearchPositions(previous.position, current.position) > 0
        ) {
          throw new Error("Neo4j returned recipe results in an invalid rank order.");
        }

      }

      const hasMore = records.length > PAGE_SIZE;
      const pageRecords = records.slice(0, PAGE_SIZE);
      const lastRecord = pageRecords.at(-1);
      const nextCursor =
        hasMore && lastRecord !== undefined
          ? encodeRecipeSearchCursor(lastRecord.position, fingerprint)
          : null;

      return {
        recipes: pageRecords.map(({ recipe }) => mapRecipeSearchResult(recipe, criteria)),
        totalCount,
        nextCursor,
      };
    } finally {
      await session.close();
    }
  }

  async getRecipeDetail(id: string): Promise<RecipeDetail | null> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(RECIPE_DETAIL_QUERY, { id });
      const record = result.records[0];
      if (record === undefined) return null;

      const individualRatings = readRatings(record.get("individualRatings"));
      return {
        id: readString(record.get("id"), "id"),
        name: readString(record.get("name"), "name"),
        minutes: readMinutes(record.get("minutes")),
        instructions: readOptionalStrings(record.get("instructions"), "instructions"),
        ingredients: readIngredientNames(record.get("ingredients")),
        cuisines: readIngredientNames(record.get("cuisines")),
        ratings: {
          individual: individualRatings,
          aggregate: individualRatings.length === 0
            ? readAggregateRating(record.get("aggregateRating"))
            : null,
        },
      };
    } finally {
      await session.close();
    }
  }
}

function readScore(record: Neo4jRecord, field: string): number {
  const value: unknown = record.get(field);
  const score = neo4j.isInt(value) ? value.toNumber() : value;
  if (typeof score !== "number" || !Number.isSafeInteger(score) || score < 0) {
    throw new Error(`Neo4j returned an invalid ${field} recipe-search score.`);
  }
  return score;
}
