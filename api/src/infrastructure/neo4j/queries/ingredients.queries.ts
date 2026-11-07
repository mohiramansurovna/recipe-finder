export const GET_INGREDIENT_QUERY = `MATCH (ingredient:Ingredient)
         WHERE NOT EXISTS {
           MATCH (ingredient)-[:ALIAS_OF]->()
         }
         RETURN ingredient.name AS name
         ORDER BY name`;
export const GET_INGREDIENT_ALIAS_QUERY = `MATCH (alias:Ingredient)-[:ALIAS_OF]->(canonical:Ingredient)
         RETURN alias.name AS alias, canonical.name AS canonicalName
         ORDER BY alias`;
export const GET_INGREDIENT_TYPES_QUERY = `MATCH (category:IngredientCategory)
         RETURN category.name AS name
         ORDER BY name`;
