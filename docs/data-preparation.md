# Data Preparation

The preparation pipeline consumes the pinned Kaggle version 2 archive and writes graph-ready CSVs locally. It reads `RAW_recipes.csv` and, when present, `RAW_interactions.csv`; it does not use preprocessed files.

## Run

After following the KaggleHub setup in the [README](../README.md), acquire the source and prepare it:

```sh
.venv/bin/python -m scripts.download_dataset
npm ci
npm run prepare:data
```

To validate the pipeline with the small synthetic fixtures instead of the full dataset:

```sh
npm test -- tests/prepare-data-cli.test.ts
```

The command accepts `--input`, `--interactions`, and `--output`; the defaults are `data/raw/RAW_recipes.csv`, the optional `data/raw/RAW_interactions.csv`, and `data/prepared/`. An explicitly supplied interactions file must exist and contain `recipe_id` and `rating` columns. It also reads the curated `data/ingredient-aliases.csv`, `data/ingredient-categories.csv`, and `data/cuisine-tags.csv` mappings. The command streams source records and writes outputs only after processing has completed. Missing or duplicate recipe IDs, malformed ingredient, instruction, or tag lists, invalid ratings or mapping data, and category mappings for ingredients absent from the prepared vocabulary stop preparation with an explicit error. Recipes with an ID but no usable name are excluded and listed in `invalid_recipes.csv`.

## Output contract

| File | Columns | Meaning |
|---|---|---|
| `recipes.csv` | `id,name,minutes,instructions,aggregateRating` | Recipe graph nodes; blank optional fields represent missing properties; instructions are JSON arrays |
| `ratings.csv` | `recipeId,rating` | Individual source rating values; zero ratings and records for excluded recipes are omitted |
| `ingredients.csv` | `name,isStaple` | Unique mechanically normalized ingredient names and explicit staple flags |
| `recipe_ingredients.csv` | `recipeId,ingredientName` | One USES edge per recipe and distinct normalized ingredient |
| `ingredient_categories.csv` | `ingredientName,category` | Curated category membership for canonical ingredients |
| `recipe_cuisines.csv` | `recipeId,cuisineName` | Recipe cuisine matches from explicitly mapped source tags |
| `cooking_time_issues.csv` | `recipeId,sourceValue,reason` | Missing or invalid source cooking times, which are kept as null |
| `cooking_time_outliers.csv` | `recipeId,minutes` | Valid cooking times flagged as suspected outliers but preserved unchanged |
| `invalid_recipes.csv` | `recipeId,sourceRecord,reason` | Excluded rows that cannot satisfy the graph's required recipe name |
| `summary.json` | counts and threshold | Processing totals without source contributor fields |

Only fields required by the graph are written. Contributor and rater identity fields, review text, raw tags, and other source metadata are not copied to prepared output. Source `steps` are stored as recipe instructions when present. Source aggregate ratings are retained only when present and valid; individual interactions preserve only recipe ID and rating value. A zero interaction rating is treated as unrated and omitted. At display time individual values take precedence over a source aggregate. Tags are parsed as data and only tags listed in `data/cuisine-tags.csv` contribute canonical cuisine rows. Ingredient category mappings in `data/ingredient-categories.csv` are explicit, not inferred; names are normalized and aliases are resolved before mapped ingredients are checked against the prepared vocabulary. Unmapped ingredients remain unclassified. Ingredient, instruction, and tag values are parsed as data; they are never evaluated as code. Normalization lowercases names and strips surrounding whitespace and punctuation without merging semantic variants. The explicit initial staple set is `salt`, `oil`, `olive oil`, `vegetable oil`, and `canola oil`.

## Cooking-time report rule

For version 2, the valid non-negative cooking-time distribution has nearest-rank Q1 = 20 minutes and Q3 = 65 minutes. The Tukey upper fence is 132.5 minutes; integer values at least 133 are reported as suspected outliers and retained. The classification is documented in the [README](../README.md) and tested immediately below and above the threshold.

Both `data/raw/` and `data/prepared/` are local-only and ignored by Git. Review dataset terms before distributing generated CSVs.

## Run the local Compose environment

Docker Compose v2 is required. After preparing `data/prepared/`, copy the tracked environment template and set a strong local password:

```sh
cp .env.example .env
# Edit .env and set NEO4J_PASSWORD.
docker compose up --build
```

Neo4j is available on Bolt port `7687`, bound to loopback by default. The importer connects over the private Compose network and reads `data/prepared/` read-only. Set `PREPARED_DATA_DIR` in `.env` to use another prepared-data directory; `NEO4J_BOLT_PORT` changes the local host port, and `NEO4J_DATABASE` selects the database.

Wait for the importer to report success before stopping the attached services with Ctrl-C. Neo4j and the Compose import marker use persistent volumes, so a later `docker compose up` reuses the graph and skips the successful import. A populated graph without the marker is not assumed to be initialized by Compose: the importer fails with the fresh-database error and leaves existing data intact. Direct `npm run import:data` invocations always retain this fresh-database guard.

To rebuild the graph after changing prepared data, stop the services and delete both persistent volumes:

```sh
docker compose down -v
```

This permanently removes the local graph and its Compose import marker. Removing only one volume can leave the marker and graph out of sync.

## Import into Neo4j

For a local Compose environment, follow [Run the local Compose environment](#run-the-local-compose-environment). The direct importer workflow below is for a separately managed, reachable Neo4j database and always requires an empty graph. It validates all prepared CSVs before connecting, checks the selected database is empty before adding constraints or data, and creates uniqueness constraints for recipe IDs, ingredient names, ingredient-category names, and cuisine names. It batches node and relationship writes in groups of 1,000. Missing cooking times remain unset as the Neo4j `minutes` property.

Set connection details in the process environment; do not put credentials in source files or commit them:

```sh
export NEO4J_URI=bolt://127.0.0.1:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD='<your-local-password>'
# Optional; defaults to neo4j
export NEO4J_DATABASE=neo4j
npm run import:data
```

To import another prepared-data directory, use `npm run import:data -- --data /path/to/prepared`. The database must be a dedicated fresh database; the importer intentionally refuses to merge into or clear an existing graph.

For a disposable local Neo4j instance, use an isolated container and a locally chosen password:

```sh
docker run --detach --rm --name recipe-graph-neo4j \
  --publish 127.0.0.1:7687:7687 \
  --env NEO4J_AUTH=neo4j/'<your-local-password>' \
  neo4j:5.26-community
```

Wait until Neo4j finishes starting before importing. To exercise the importer with the small test fixture, configure `NEO4J_TEST_URI`, `NEO4J_TEST_USER`, `NEO4J_TEST_PASSWORD`, and optionally `NEO4J_TEST_DATABASE` for an empty disposable database, then run:

```sh
npm test -- tests/import-data.integration.test.ts
```

The integration test writes fixture records and constraints to that database. The regular test suite skips this test unless all `NEO4J_TEST_*` connection variables are set.

To run the documented CLI with the fixture instead, set the `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` variables above to the same kind of fresh disposable database and run:

```sh
npm run import:data -- --data tests/fixtures/prepared
```

If a connection or batch fails after earlier batches have committed, the graph may be partially populated. Do not retry the import against it: the empty-graph guard will reject it. Discard and recreate the disposable database/container, or explicitly rebuild the target database using the database administrator's approved procedure, then rerun the import. The importer does not delete existing data or provide whole-dataset transaction/rollback semantics.
