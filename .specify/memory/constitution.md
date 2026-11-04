<!--
Sync Impact Report
- Version change: 0.0.0 -> 1.0.0
- Modified principles: All template principles replaced with project-specific governance
- Added sections: Core Principles, Additional Constraints, Development Workflow, Governance
- Removed sections: None
- Deferred items: None
-->

# Recipe Finder Constitution

## Core Principles

### I. Data Integrity Before Convenience

Every recipe, ingredient, and dataset transformation MUST preserve the source contract, provenance, and validation rules before optimization or feature work. The project treats data quality as a product requirement, not a cleanup task: raw source files remain immutable inputs, prepared outputs are generated deterministically, and any schema or classification change MUST be documented and validated with repository tests.

### II. Local-First, Privacy-Safe Operations

The application MUST operate on local-only source data and local development resources unless a workflow explicitly requires external access. Secrets, Kaggle credentials, and environment-specific configuration MUST remain outside version-controlled files; Docker Compose and local Neo4j services MUST keep database and app ports bound to loopback by default, and any public exposure is forbidden without an explicit security review.

### III. Test-First Delivery for Product and Data Changes

All product, data-preparation, import, and API changes MUST be covered by tests before merge. The repository MUST prefer the smallest executable verification that proves the contract: unit tests for data-normalization edge cases, integration tests for API and graph contracts, and the repository check command before completion. When a bug is identified, the fix MUST include a regression test that fails before the change and passes after it.

### IV. Contract-Driven Integration

Interfaces between the importer, prepared data, API, and UI MUST be treated as versioned contracts. Breaking a data schema, Neo4j import contract, API response, or UI state contract MUST trigger explicit change review, migration notes, and compatibility evaluation. Mocked or inferred interfaces are not a substitute for real integration tests where the repository already defines a contract.

### V. Release Discipline and Measurable Scope

The project MUST follow release slices with clear scope boundaries and must not broaden work beyond the active slice without updating the product and technical plan. Recipes, ranking, filtering, and broader user-facing features are intentionally deferred until the active slice is complete; when scope changes, the reasons and impact MUST be recorded in the repository documentation and spec artifacts before implementation continues.

## Additional Constraints

The repository MUST preserve the following constraints:

- Data files in `data/raw/` and generated outputs under `data/prepared/` are local-only artifacts and MUST NOT be committed without explicit project approval.
- The application MUST document dataset provenance, verification steps, and cooking-time outlier logic for every prepared-data release.
- Docker-based local development MUST remain reproducible via `docker compose` and MUST not require hidden setup steps beyond the documented environment variables.
- Any new dependency, database schema, or operational change MUST be justified in project documentation and must retain compatibility with the existing local stack.
- All user-facing content MUST avoid exposing contributor identities, sensitive user data, or credentials.

## Development Workflow

The repository MUST follow this workflow before a branch is considered ready for review:

1. Define the data or product contract in the relevant spec or documentation before implementation.
2. Add or update the smallest relevant tests that encode the expected behavior.
3. Implement the change with the minimum necessary scope and preserve the current release slice.
4. Run the repository verification command, `npm run check`, before submitting work for review.
5. Confirm that any dataset, import, or environment changes are still reproducible from the documented setup steps.

The team MUST prefer small, reviewable changes that preserve a clear trace from requirement to implementation and verification. Decisions that alter release scope, dataset provenance, or operational security MUST be recorded in the relevant docs before merge.

## Governance

This Constitution governs repository decisions for product scope, data handling, quality gates, and development process. It supersedes informal practices that conflict with its rules. Amendments require a written rationale, explicit version bump, compatibility assessment, and review before the change is accepted.

The project MUST evaluate compliance during pull requests and release readiness reviews. Any deviation from the Constitution, especially around data safety, security, or testing requirements, MUST be documented and approved before it is merged. Unjustified complexity or undocumented scope expansion is non-compliant.

Versioning MUST follow semantic versioning:

- MAJOR: backward-incompatible governance or principle changes;
- MINOR: newly added or materially expanded principles or sections;
- PATCH: clarifications, wording fixes, and non-semantic refinements.

**Version**: 1.0.0 | **Ratified**: 2026-11-03 | **Last Amended**: 2026-11-03
