# Tasks

## 1. Repository Foundation

- [x] 1.1 Create the initial repository skeleton, TypeScript package setup, lint and Vitest configuration, and README; verify the documented lint and test commands run successfully.

## 2. Dataset Source and Acquisition

- [x] 2.1 Download dataset version 2 using the pinned KaggleHub source and verify the archive manifest contains the raw recipe fields required by the PRD; record the verified filenames and schema, and stop for source reconsideration before parser work if incompatible.
- [x] 2.2 Add an optional Python/KaggleHub downloader that stages version 2 under `data/raw/`, uses local Kaggle authentication, and pins its dependency; verify destination and error behavior with tests and document setup and usage in the README.

## 3. Data Preparation

- [x] 3.1 Profile valid cooking times from the verified source, choose and document a deterministic outlier-reporting threshold, and verify expected classifications at the threshold boundaries.
- [x] 3.2 Implement deterministic preparation for recipes, ingredients, and USES rows, including mechanical name normalization, an explicit staple list, null cooking times, and exclusion of contributor fields; verify behavior with fixture-based unit tests.
- [x] 3.3 Write prepared CSVs and diagnostic reports, including excluded rows, under the local prepared-data directory, ignore both raw and prepared dataset files in version control, and document the input/output contract and reproducible commands; verify the documented preparation command against fixtures.
- [x] 3.4 Update the data model documentation to specify nullable cooking times and the first-slice graph fields; verify it agrees with the capability spec and generated CSV format.

## 4. Neo4j Import

- [x] 4.1 Add the official Neo4j TypeScript driver and implement a batched importer with uniqueness constraints and a fresh-database guard; verify validation and non-empty-database rejection with focused tests.
- [x] 4.2 Exercise the importer against a disposable Neo4j database using fixture CSVs; verify Recipe and Ingredient nodes, USES relationships, null-time handling, and refusal to load into a non-empty graph.
- [x] 4.3 Document connection configuration, fresh-database requirements, and recovery after partial failure; verify the documented import workflow succeeds against the disposable database.
