export interface IngredientRepository {
  getIngredientNames(): Promise<readonly string[]>;
}
