# Graph Data Model

## Nodes
- Recipe: id (unique), name, minutes (optional when the source value is missing or invalid), instructions (optional string list), aggregateRating (optional source value)
- Ingredient: name (unique), isStaple (boolean)
- IngredientCategory: name (unique), one of dairy, nuts, meat, or fish/seafood
- Cuisine: name (unique)
- Rating: anonymous source value records added in release R5; no User node is imported

## Relationships
- (Recipe)-[:USES]->(Ingredient)
- (Ingredient)-[:IN_CATEGORY]->(IngredientCategory)
- (Recipe)-[:IN_CUISINE]->(Cuisine)
- (Recipe)-[:HAS_RATING]->(Rating)
- (Ingredient)-[:ALIAS_OF]->(Ingredient)
- (Ingredient)-[:SUBSTITUTE_FOR]->(Ingredient)

## Constraints
- Unique Recipe.id
- Unique Ingredient.name
- Unique IngredientCategory.name
- Unique Cuisine.name

## Rules
- Contributor and rater identities are never imported, shown or stored.
- Ingredient names are lowercase and normalized by the preparation script.
- Staples (salt, oil, and similar) are flagged with isStaple.
- Cooking-time outliers are reported by the preparation script and preserved unchanged.
- Missing or invalid cooking times remain null in prepared data and are omitted as a Neo4j property.
- Missing instructions and aggregate ratings remain unavailable and are omitted as Neo4j properties.
- Recipes without a usable name are excluded and reported; recipe IDs must be unique.

## Change 001 CSV mapping
- `recipes.csv`: `id`, `name`, and `minutes`; a blank `minutes` value means the Neo4j property is unset.
- `ingredients.csv`: `name` and `isStaple`.
- `recipe_ingredients.csv`: `recipeId` and `ingredientName`, mapped to `USES` relationships.
- Diagnostic CSVs report invalid times, suspected outliers, and excluded recipes; they are not imported into the graph.

## Change 005 alias mapping
- `data/ingredient-aliases.csv` is the curated source with `alias` and `canonicalName` columns.
- Data preparation normalizes aliases, requires each canonical target to exist in the prepared ingredient vocabulary, rewrites recipe uses to canonical names, and emits `ingredient_aliases.csv`.
- `ingredient_aliases.csv` contains `alias` and `canonicalName`; import creates an `Ingredient` node for each alias and an `(alias)-[:ALIAS_OF]->(canonical)` relationship. Alias nodes are not connected to recipes through `USES`.
- Aliases map directly to canonical ingredient names; self-aliases, conflicting mappings, and chains are invalid.

## Change 006 category and cuisine mappings
- `data/ingredient-categories.csv` is the curated source with `ingredientName` and `category` columns. Supported categories are `dairy`, `nuts`, `meat`, and `fish/seafood`.
- Preparation normalizes ingredient names, applies aliases to canonicalize them, and requires every mapped ingredient to exist in the prepared ingredient vocabulary. It emits `ingredient_categories.csv`; import connects each canonical Ingredient to its IngredientCategory.
- `data/cuisine-tags.csv` is the curated source with `sourceTag` and `cuisineName` columns. Only source tags explicitly present in this mapping become cuisines; other tags are ignored.
- Preparation emits one `recipe_cuisines.csv` row for each distinct recipe/cuisine match. Import connects Recipe nodes to Cuisine nodes. Recipes without a mapped cuisine remain eligible when no cuisine filter is selected.
- Category membership is explicit and may be incomplete; an unclassified ingredient is not treated as safe for any dietary or allergen purpose.

## Change 009 recipe details and ratings
- `recipes.csv` adds `instructions` as a JSON string array and `aggregateRating`; blank values mean the source field is unavailable.
- `ratings.csv` contains only `recipeId` and `rating`. Each valid nonzero source interaction rating becomes an anonymous `Rating {value}` node connected by `HAS_RATING`. User IDs, contributor IDs, dates, and review text are excluded.
- API detail reads return individual rating values when any are available; only otherwise is the source aggregate returned. No rating records and no aggregate means no ratings.

## Which change introduces what
- 001 data-prep-and-import: Recipe, Ingredient, USES, isStaple
- 005 aliases-and-typo-tolerance: ALIAS_OF
- 006 categories-and-filters: IngredientCategory, IN_CATEGORY, Cuisine, IN_CUISINE
- 009 substitutions: SUBSTITUTE_FOR
- 009 recipe-detail-and-reviews: Recipe instructions, HAS_RATING, Rating
- 010 personalization: User