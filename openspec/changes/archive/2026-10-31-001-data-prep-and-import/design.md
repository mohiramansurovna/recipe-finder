# Design

## Context

See `proposal.md` for motivation and `specs/data-prep-and-import/spec.md` for the behavior contract. The repository has no implementation yet. The initial graph model is Recipe, Ingredient, and USES; later changes add aliases, cuisine, substitutions, and personalization.

## Goals / Non-Goals

**Goals:**
- Keep dataset acquisition separate from deterministic preparation and import.
- Make the initial graph load usable against any reachable Neo4j instance before Compose is introduced.
- Keep preprocessing auditable and avoid irreversible semantic ingredient merges.

**Non-Goals:**
- Implement incremental synchronization or replace an existing graph.
- Add runtime dataset downloads, ratings, contributor data, aliases, cuisines, or application search.
- Scaffold API, frontend, or infrastructure components not needed by this slice.

## Decisions

### Separate optional acquisition from preparation

An optional Python helper uses KaggleHub to download `shuyangli94/food-com-recipes-and-user-interactions` version 2 into `data/raw/`. KaggleHub is a new, setup-time Python dependency, chosen to match the requested acquisition API; the application and deterministic preparation pipeline remain TypeScript/Node and offline. Use the user's local Kaggle authentication, never store credentials in the repository, and let users who already have the archive skip acquisition.

The public dataset metadata identifies version 2 but does not confirm that its archive contains the raw recipe fields required by the PRD. Make archive-manifest and schema verification the first data task. Do not write the parser against preprocessed substitutes; if the pinned archive is incompatible, stop and revisit the source choice. Never commit raw or prepared dataset files. Generate graph-ready CSVs under `data/prepared/` and keep them local until redistribution rights are reviewed.

### Use a deterministic, auditable preparation pipeline

Use `csv-parse` to stream RFC-compliant CSV records without loading the full source file into memory; the raw archive contains quoted fields and is hundreds of megabytes. Validate required input columns and values before writing graph-ready CSVs. If a row has an ID but no usable name, exclude it from graph data and report its ID and source record; duplicate or missing IDs and malformed ingredient lists remain fatal errors. Normalize ingredient names mechanically (case, surrounding whitespace, and punctuation) but do not merge semantic variants; the later alias capability owns that behavior. Use an explicit staple list, initially including the documented salt and oil staples. Keep the output limited to recipe IDs, recipe names, cooking times, normalized ingredient names, staple flags, and USES edges. Preserve recipes with missing or invalid cooking times by representing the value as null and reporting the affected rows; the importer leaves the Neo4j `minutes` property unset for these records.

Preserve valid cooking-time values, including suspected outliers, and report suspicious values. Profile the pinned dataset first, then select and document a deterministic outlier threshold before implementing preparation. Preserve all valid values regardless of whether they are reported as outliers.

### Import through the official Neo4j TypeScript driver

Implement a TypeScript command that reads prepared CSVs, validates the graph shape, checks that the target database is empty, creates the initial graph, and writes rows in bounded batches through the official Neo4j driver. This avoids coupling the importer to Neo4j server-side file paths required by `LOAD CSV`, and it can run against a local or remote reachable database. The driver is a justified dependency for this graph-writing capability and can support later API database access.

Create uniqueness constraints for `Recipe.id` and `Ingredient.name` before importing. If any graph data already exists, stop before writes; do not merge, delete, or replace it. Validate source rows before connecting/writing where practical. If a batch fails after earlier batches committed, report the failure and require an explicit clean-database rebuild before retrying; the importer does not claim atomic whole-dataset replacement.

### Keep tooling proportional to the first slice

Set up only the initial TypeScript, lint, and Vitest tooling, plus tests for deterministic preparation and importer validation. Use small fixture data rather than copying the full dataset into tests. Do not create the future API, web, Compose, or Terraform trees here.

## Risks / Trade-offs

- [Pinned Kaggle archive lacks or changes the expected source schema] -> Verify version 2's manifest before parser work and fail clearly if required fields are missing.
- [Dataset license or generated CSV size limits distribution] -> Keep raw files local and review terms before publishing or committing prepared outputs.
- [Outlier cutoff is dataset-dependent] -> Profile version 2, define a documented deterministic rule, and test its boundaries before parser implementation.
- [A database or connection failure occurs after some batches commit] -> Fail explicitly and document rebuilding an empty database before retrying.
- [The staple list is incomplete] -> Keep it explicit and small, then extend it in a later scoped change based on evaluated needs.
