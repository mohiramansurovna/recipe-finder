# Recipe Graph

Ingredient-first recipe discovery: enter what you have and review the ingredients the app recognizes. Recipe search and results are planned for the next release.

## Requirements

- Node.js 20 or newer and npm
- Docker Compose v2 for the local application and graph environment

## Development setup

```sh
npm ci
npm run check
```

`npm run check` runs ESLint, TypeScript type-checking, and the Vitest suite.

The Food.com source data and generated graph CSVs are local-only files in `data/raw/` and `data/prepared/`. They are not committed to this repository.

### Run the API and web in development mode

Create `.env` from `.env.example` and set `NEO4J_PASSWORD`. The API loads the root `.env`; Vite uses the same file and proxies `/api` requests to `http://localhost:3000`.

Start Neo4j and import the prepared data:

```sh
docker compose up neo4j importer
```

After the importer exits successfully, run the API and web dev server in separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173). For this mode, `NEO4J_URI` in `.env` must be `bolt://localhost:7687`, because the API runs on the host. Compose overrides it to `bolt://neo4j:7687` when running the API in a container.

## Run the local app

First acquire and prepare the local data using the steps in [the data-preparation guide](docs/data-preparation.md). Then copy `.env.example` to `.env` and set `NEO4J_PASSWORD` to a strong local password:

```sh
cp .env.example .env
# Edit .env and set NEO4J_PASSWORD.
docker compose up --build
```

Compose starts Neo4j, imports the prepared graph data, starts the API, and serves the web app through Caddy. Once the importer reports success and the API is healthy, open [http://localhost:8080](http://localhost:8080) (or the `APP_PORT` configured in `.env`). The app interprets ingredient text and lets you add, remove, and toggle ingredient chips. It does not show recipe results yet; recipe search is a separate release slice. The UI credits the Food.com Recipes and Interactions dataset and never displays contributor identities.

The Neo4j Bolt port and web app port are bound to loopback only. Neo4j is not exposed through the public network. Stop the attached services with Ctrl-C or run `docker compose down`; both preserve the local graph and successful-import marker, so later starts skip an import that already succeeded.

To intentionally rebuild the local graph from prepared CSVs, stop the services and remove the Compose volumes:

```sh
docker compose down -v
```

This deletes the local Neo4j graph, import marker, and generated web assets. The graph and marker must be reset together; the importer refuses to load into a non-empty graph that lacks the Compose completion marker.

## Dataset source verification

The pinned source is Kaggle's `shuyangli94/food-com-recipes-and-user-interactions`, dataset version 2. Its archive was verified to contain `RAW_recipes.csv` with the required `name`, `id`, `minutes`, `tags`, and `ingredients` columns. The archive also contains interaction and preprocessed files, which the first data-preparation slice does not use. Contributor fields such as `contributor_id` are deliberately excluded from prepared output and the graph.

The verified archive also contains `RAW_interactions.csv`, `interactions_train.csv`, `interactions_test.csv`, `interactions_validation.csv`, `PP_recipes.csv`, `PP_users.csv`, and `ingr_map.pkl`; these are not inputs to the initial preparation slice.

## Cooking-time outlier rule

The version 2 recipe file has 231,637 rows with valid non-negative integer cooking times, including 1,094 zero-minute values. Using nearest-rank quartiles, Q1 is 20 minutes and Q3 is 65 minutes. The deterministic Tukey upper fence is `Q3 + 1.5 * (Q3 - Q1) = 132.5` minutes. Integer cooking times of 133 minutes or more are reported as suspected outliers, but are preserved unchanged. This rule flags 23,714 rows in the pinned source. Values below the fence remain unflagged; invalid or missing values are handled separately.

## Download the dataset

KaggleHub uses the user's local Kaggle authentication. Configure it using Kaggle's supported local authentication methods before downloading; never put tokens in repository files.

```sh
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m scripts.download_dataset
```

The helper downloads the pinned version to `data/raw/` and verifies that `RAW_recipes.csv` contains the required columns. It exits with an actionable error if authentication fails or the archive schema differs.

## Prepare graph data

```sh
npm ci
npm run prepare:data
```

See [the data-preparation guide](docs/data-preparation.md) for the CSV contracts, reports, and fixture-based verification command.

## Project scope

This repository is being built in release order. The R0 changes establish data preparation, Neo4j import, and the local Compose environment. The current R1 slice adds ingredient parsing and editable chips; recipe search, ranking, pagination, and time filters are planned separately.

See [the product requirements](docs/prd.md), [the graph data model](docs/data-model.md), and [the architecture](docs/architecture.md).
