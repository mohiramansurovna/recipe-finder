export const GET_RECIPE_QUERY = `MATCH (cuisine:Cuisine)
         RETURN cuisine.name AS name
         ORDER BY name`;
/**
 * Candidates start from the included ingredient nodes (unique-indexed by name) and walk their
 * USES relationships, so recipes sharing no included ingredient are never touched.
 * Time and rating filters, ordering and paging happen in the service.
 */
export const CANDIDATES_QUERY = `
MATCH (ingredient:Ingredient)
WHERE ingredient.name IN $included
MATCH (recipe:Recipe)-[:USES]->(ingredient)
WITH recipe, count(DISTINCT ingredient) AS matched
WHERE NOT EXISTS {
    MATCH (recipe)-[:USES]->(excluded:Ingredient)
    WHERE excluded.name IN $excluded
  }
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
RETURN recipe.id AS id,
       matched,
       COUNT { (recipe)-[:USES]->() } - matched AS missing,
       recipe.minutes AS minutes,
       recipe.ratingAverage AS ratingAverage
`;

export const SEARCH_RECORDS_QUERY = `
MATCH (recipe:Recipe)
WHERE recipe.id IN $ids
OPTIONAL MATCH (recipe)-[:USES]->(ingredient:Ingredient)
RETURN recipe.id AS id, recipe.name AS name, recipe.minutes AS minutes,
       collect(DISTINCT ingredient.name) AS ingredientNames
`;

export const GRAPH_STATE_QUERY = `
MATCH (marker:RecipeGraphMetadata {key: 'recipe-import'})
RETURN toString(marker.completedAt) AS identity,
       coalesce(marker.ratingFieldsReady, false) AS ratingFieldsReady
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
  WHERE rating.value > 0
  RETURN collect(rating.value) AS individualRatings
}
CALL {
  WITH recipe
  OPTIONAL MATCH (recipe)-[:HAS_RATING]->(rating:Rating)
  WHERE rating.value > 0
  RETURN avg(rating.value) AS combinedRating
}
RETURN recipe.id AS id, recipe.name AS name, recipe.minutes AS minutes,
       recipe.instructions AS instructions,
       recipe.aggregateRating AS aggregateRating,
       combinedRating AS combinedRating,
       ingredients AS ingredients, cuisines AS cuisines,
       individualRatings AS individualRatings
`;
