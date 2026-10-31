# Proposal

## Why

Recipe Graph needs a reproducible path from the Food.com recipe dataset to the first graph model, without committing dataset files or importing contributor identities. This R0 slice establishes the repository foundation and data pipeline needed for later search and local Compose work; it supports the PRD's reproducibility and data-protection non-functional requirements.

## What Changes

- Create the initial repository skeleton, base TypeScript/lint/Vitest tooling, and README.
- Add an optional KaggleHub acquisition helper for `shuyangli94/food-com-recipes-and-user-interactions`, pinned to dataset version 2; keep raw and generated data local and out of version control.
- Verify the pinned archive's manifest and required raw recipe fields before parser work; stop and revisit the source choice if the archive is incompatible.
- Prepare and validate graph-ready CSVs for recipes and ingredients, using mechanical ingredient-name normalization and flagging staples.
- Preserve missing cooking times as null and report them; preserve valid suspected outliers and report them using a deterministic threshold selected after profiling the pinned dataset.
- Define a reusable Neo4j importer that only loads into a fresh/empty database and fails clearly otherwise.
- Add focused tests and documentation for the preparation and import workflow.

## Capabilities

### New Capabilities
- `data-prep-and-import`: Acquire the source files optionally, prepare recipe and ingredient data, and load the first graph model into a fresh Neo4j database.

### Modified Capabilities
- None.

## Impact

- Adds the initial project tooling and documentation, data-preparation scripts, local data-directory conventions, graph-ready CSV format, and Neo4j import workflow.
- Adds an optional Python/KaggleHub acquisition helper and the official Neo4j TypeScript driver for import. Dataset acquisition is setup-time only; the application has no runtime external API calls.
- Establishes only the R0 graph entities and relationships: Recipe, Ingredient, USES, and staple flags. Aliases, cuisine, substitutions, ratings, and contributor identities are out of scope.
