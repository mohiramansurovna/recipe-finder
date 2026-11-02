# Tasks

## 1. Curated aliases and graph import

- [x] 1.1 Add a checked-in curated alias source and extend data preparation to validate and emit canonical ingredient targets plus `ingredient_aliases.csv`; verify preparation tests cover normalization, duplicate/conflicting mappings, and generated output.
- [x] 1.2 Extend prepared-data validation and Neo4j import to create alias Ingredient nodes and `ALIAS_OF` relationships; verify importer unit and isolated-graph integration tests cover valid mappings, invalid mappings, and repeatable relationship creation.
- [x] 1.3 Update `docs/data-model.md` with the direct alias-to-canonical mapping and curated source flow; verify the documented relationship direction and import file names match the implementation.

## 2. Canonical parsing and user-visible behavior

- [x] 2.1 Extend the ingredient repository to provide canonical names and alias mappings while keeping the vocabulary endpoint canonical-only; verify API tests preserve the endpoint response shape and exclude alias nodes from addable ingredients.
- [x] 2.2 Extend the pure parser to resolve exact aliases and unique one-edit typos, including negated terms and canonical deduplication; verify unit tests cover insertion, deletion, substitution, transposition, short tokens, ambiguity, weak matches, unrecognized terms, and “I don't have,” “I don’t have any,” and “I do not have” negation forms.
- [x] 2.3 Wire the repository data into the parse endpoint and preserve its existing response contract; verify API integration tests parse aliases, typos, and possession-negated ingredients to canonical included/excluded names and return unresolved terms as unrecognized.
- [x] 2.4 Verify canonical names appear on editable chips and are sent to recipe search; add UI coverage and a search integration case proving aliases and typos find recipes using the canonical ingredient and possession-negated ingredients are sent as excluded criteria, and update `docs/architecture.md` to describe the matching flow.

## 3. Integrated verification

- [x] 3.1 Run `npm run check`, `npm run build:api`, and `npm run build:web`; verify all tests pass, including the isolated Neo4j search integration case, without touching the Compose database.
