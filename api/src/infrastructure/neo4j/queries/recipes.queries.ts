export const PAGE_SIZE = 20;

export const GET_RECIPE_QUERY = `MATCH (cuisine:Cuisine)
         RETURN cuisine.name AS name
         ORDER BY name`;
export const ELIGIBILITY_FILTERS = `
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

export const COUNT_QUERY = `
MATCH (recipe:Recipe)
WHERE ${ELIGIBILITY_FILTERS}
RETURN count(recipe) AS totalCount
`;

export const SEARCH_QUERY = `
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

export const RECIPE_DETAIL_QUERY = `
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
