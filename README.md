# Recipe Graph

Ingredient-first recipe discovery: enter what you have and find recipes ranked by the ingredients you are missing.

## Requirements

- Node.js 20 or newer and npm

## Development setup

```sh
npm ci
npm run check
```

`npm run check` runs ESLint, TypeScript type-checking, and the Vitest suite.

The Food.com source data and generated graph CSVs are local-only files in `data/raw/` and `data/prepared/`. They are not committed to this repository.

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

This repository is being built in release order. The first change establishes the data preparation and Neo4j import foundation; later changes add the Compose environment, recipe search, and web application.

See [the product requirements](docs/prd.md), [the graph data model](docs/data-model.md), and [the architecture](docs/architecture.md).
