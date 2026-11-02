import type neo4j from "neo4j-driver";

import type { IngredientRepository } from "./ingredient-repository.js";

export class Neo4jIngredientRepository implements IngredientRepository {
  constructor(
    private readonly driver: neo4j.Driver,
    private readonly database: string,
  ) {}

  async getIngredientNames(): Promise<readonly string[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        "MATCH (ingredient:Ingredient) RETURN ingredient.name AS name ORDER BY name",
      );
      return result.records.map((record) => {
        const name: unknown = record.get("name");
        if (typeof name !== "string") {
          throw new Error("Neo4j returned an ingredient without a valid name.");
        }
        return name;
      });
    } finally {
      await session.close();
    }
  }
}
