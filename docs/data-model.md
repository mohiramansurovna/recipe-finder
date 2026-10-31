# Graph Data Model

## Nodes
- Recipe: id (unique), name, minutes (optional when the source value is missing or invalid)
- Ingredient: name (unique), isStaple (boolean)
- Cuisine: name (unique)
- User and Rating: added in release R5 only

## Relationships
- (Recipe)-[:USES]->(Ingredient)
- (Recipe)-[:IN_CUISINE]->(Cuisine)
- (Ingredient)-[:ALIAS_OF]->(Ingredient)
- (Ingredient)-[:SUBSTITUTE_FOR]->(Ingredient)

## Constraints
- Unique Recipe.id
- Unique Ingredient.name
- Unique Cuisine.name

## Rules
- Contributor identities are never imported, shown or stored.
- Ingredient names are lowercase and normalized by the preparation script.
- Staples (salt, oil, and similar) are flagged with isStaple.
- Cooking-time outliers are reported by the preparation script and preserved unchanged.
- Missing or invalid cooking times remain null in prepared data and are omitted as a Neo4j property.
- Recipes without a usable name are excluded and reported; recipe IDs must be unique.

## Change 001 CSV mapping
- `recipes.csv`: `id`, `name`, and `minutes`; a blank `minutes` value means the Neo4j property is unset.
- `ingredients.csv`: `name` and `isStaple`.
- `recipe_ingredients.csv`: `recipeId` and `ingredientName`, mapped to `USES` relationships.
- Diagnostic CSVs report invalid times, suspected outliers, and excluded recipes; they are not imported into the graph.

## Which change introduces what
- 001 data-prep-and-import: Recipe, Ingredient, USES, isStaple
- 005 aliases-and-typo-tolerance: ALIAS_OF
- 008 categories-and-filters: Cuisine, IN_CUISINE, ingredient categories
- 009 substitutions: SUBSTITUTE_FOR
- 010 personalization: User, Rating