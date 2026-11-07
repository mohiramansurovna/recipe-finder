import type neo4j from "neo4j-driver";

import type {
  IngredientAlias,
  IngredientRepository,
} from "../ports/ingredient-repository.js";

export class Neo4jIngredientRepository implements IngredientRepository {
  constructor(
    private readonly driver: neo4j.Driver,
    private readonly database: string,
  ) {}

  async getIngredientNames(): Promise<readonly string[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (ingredient:Ingredient)
         WHERE NOT EXISTS {
           MATCH (ingredient)-[:ALIAS_OF]->()
         }
         RETURN ingredient.name AS name
         ORDER BY name`,
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

  async getIngredientAliases(): Promise<readonly IngredientAlias[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (alias:Ingredient)-[:ALIAS_OF]->(canonical:Ingredient)
         RETURN alias.name AS alias, canonical.name AS canonicalName
         ORDER BY alias`,
      );
      return result.records.map((record) => {
        const alias: unknown = record.get("alias");
        const canonicalName: unknown = record.get("canonicalName");
        if (typeof alias !== "string" || typeof canonicalName !== "string") {
          throw new Error("Neo4j returned an ingredient alias without valid names.");
        }
        return { alias, canonicalName };
      });
    } finally {
      await session.close();
    }
  }

  async getIngredientCategories(): Promise<readonly string[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (category:IngredientCategory)
         RETURN category.name AS name
         ORDER BY name`,
      );
      return result.records.map((record) => {
        const name: unknown = record.get("name");
        if (typeof name !== "string") {
          throw new Error("Neo4j returned an ingredient category without a valid name.");
        }
        return name;
      });
    } finally {
      await session.close();
    }
  }
}
