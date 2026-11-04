---
id: SPEC-recipe-detail-and-reviews
companions:
  - ../../../docs/data-model.md
sources: []
---

# Recipe Details and Imported Ratings

## Why

Home cooks need enough information to choose a recipe and assess its existing ratings. This R5 slice extends ingredient-first discovery with recipe details and read-only ratings from the recipe dataset.

## Capabilities

- **CAP-1**
  - **intent:** A cook can open a recipe from search results and inspect its full recipe details.
  - **success:** The detail view identifies the selected recipe and presents the agreed detail fields without inventing unavailable values.
- **CAP-2**
  - **intent:** A cook can view ratings imported from the source dataset for a recipe.
  - **success:** Displayed rating information comes from imported data, and the interface offers no rating-submission flow.

## Constraints

- Recipe details and ratings come from the existing recipe dataset, including its ratings file; do not introduce runtime external APIs or LLM calls.
- Do not add accounts, logins, user-submitted recipes, or user-submitted reviews. Do not show or store recipe contributor identities or expose rater identities.
- Follow the existing Recipe and Rating data model in the adopted companion.

## Non-goals

- User accounts, authentication, user-generated recipes or reviews, and personalized ranking.

## Success signal

A cook can open a search result, inspect its agreed detail fields, and see its dataset-derived rating information. The displayed information maps to the selected recipe; no review submission or contributor/rater identity is exposed.

## Assumptions

- The ratings file referenced by the PRD is the source for review-like information; this scope does not create new ratings.

## Open Questions

- Which fields constitute “full recipe details” in the detail view? The PRD names recipe, time, tags, and ingredients but does not specify a complete detail payload.
It should also include instructions, try to include anything the database can provide, and avoid inventing values for missing fields.
- Should imported ratings be presented as an aggregate, individual rating records, or another summary?
individual rating records are preferred, but an aggregate is acceptable if the dataset does not provide individual ratings.
