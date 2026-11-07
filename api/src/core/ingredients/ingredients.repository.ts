export interface IngredientAlias {
  alias: string;
  canonicalName: string;
}

export interface IngredientsRepository {
  /** Loads canonical ingredient names in deterministic order. */
  getIngredientNames(): Promise<readonly string[]>;
  getIngredientAliases(): Promise<readonly IngredientAlias[]>;
  getIngredientCategories(): Promise<readonly string[]>;
}
