export interface IngredientAlias {
  alias: string;
  canonicalName: string;
}

export interface IngredientRepository {
  getIngredientNames(): Promise<readonly string[]>;
  getIngredientAliases(): Promise<readonly IngredientAlias[]>;
  getIngredientCategories(): Promise<readonly string[]>;
}
