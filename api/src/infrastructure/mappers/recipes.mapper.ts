import type { RecipeSearchCriteria, RecipeSearchRecord, RecipeSearchResult } from "../../core/recipes/recipes.types.js";

export class RecipesMapper {
    static toDomain(
        recipe: RecipeSearchRecord,
        criteria: Pick<RecipeSearchCriteria, 'included' | 'excluded'>
    ): RecipeSearchResult {
        const recipeIngredients = new Set(recipe.ingredientNames);
        const included = new Set(criteria.included);
        const matchedIngredients = criteria.included.filter(name => recipeIngredients.has(name));
        const missingIngredients = recipe.ingredientNames.filter(name => !included.has(name));
        const excludedIngredients = criteria.excluded.filter(name => recipeIngredients.has(name));

        return {
            id: recipe.id,
            name: recipe.name,
            minutes: recipe.minutes,
            matchedIngredients,
            missingIngredients,
            excludedIngredients,
        };
    }
}
