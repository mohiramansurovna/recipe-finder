/**
 * Recipe.ratingAverage / ratingCount mirror what recipe detail shows: the average of
 * individual ratings above 0, otherwise the dataset aggregateRating, otherwise null.
 */
export const REFRESH_RECIPE_RATING_QUERY = `
MATCH (recipe:Recipe {id: $recipeId})
OPTIONAL MATCH (recipe)-[:HAS_RATING]->(rating:Rating)
WHERE rating.value > 0
WITH recipe, avg(rating.value) AS average, count(rating) AS ratingCount
SET recipe.ratingAverage = coalesce(average, recipe.aggregateRating),
    recipe.ratingCount = ratingCount
`;

export const REFRESH_ALL_RATINGS_QUERY = `
MATCH (recipe:Recipe)
CALL (recipe) {
  OPTIONAL MATCH (recipe)-[:HAS_RATING]->(rating:Rating)
  WHERE rating.value > 0
  WITH recipe, avg(rating.value) AS average, count(rating) AS ratingCount
  SET recipe.ratingAverage = coalesce(average, recipe.aggregateRating),
      recipe.ratingCount = ratingCount
} IN TRANSACTIONS OF 5000 ROWS
`;

export const MARK_RATING_FIELDS_READY_QUERY = `
MATCH (metadata:RecipeGraphMetadata {key: 'recipe-import'})
SET metadata.ratingFieldsReady = true
`;
