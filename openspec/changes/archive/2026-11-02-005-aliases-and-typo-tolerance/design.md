# Design

## Context

See `proposal.md` for motivation and `specs/ingredient-parsing-and-chips/spec.md` for the behavior contract. The current parser is a pure TypeScript function matching text to exact ingredient phrases. The ingredient repository returns graph ingredient names, and the parse endpoint passes those names to the parser. The graph model already defines `ALIAS_OF`, but the current preparation and import path does not create alias relationships.

## Goals / Non-Goals

**Goals:**
- Keep parsing deterministic and local, with no external service or new dependency.
- Resolve explicit aliases and conservative typos to canonical names before returning criteria.
- Preserve the parse endpoint response shape and the existing search contract, which receives ingredient names.
- Keep alias nodes and relationships consistent with the existing graph model and unique ingredient-name constraint.

**Non-Goals:**
- Change recipe ranking, staples, rarity weighting, or minimum-match thresholds.
- Persist typo variants as graph data or provide interactive correction suggestions.
- Infer ingredient categories, substitutions, or alias chains.

## Decisions

### Store a curated, direct alias map and import it as graph relationships

Maintain a small checked-in alias source at `data/ingredient-aliases.csv`, separate from generated prepared outputs. The preparation step validates and emits an `ingredient_aliases.csv` alongside the existing graph-ready files. Each row maps one normalized alias directly to one canonical name. Preparation ensures canonical targets are present in the ingredient data; import creates alias ingredient nodes and `ALIAS_OF` edges using the existing unique name constraint and idempotent `MERGE` pattern.

Reject empty names, self-aliases, duplicate aliases with conflicting targets, and alias chains or cycles. `GET /api/ingredients` should expose canonical names only, while the ingredient repository supplies alias-to-canonical pairs to parsing. This prevents aliases from appearing as separate addable criteria.

**Alternative considered:** Keep aliases only in the parser vocabulary. That would leave the documented graph relationship unused and would split alias behavior from the imported graph data.

### Canonicalize exact aliases before typo matching

Extend the repository/parser input with canonical names and their curated alias mappings. Keep the parser pure: it receives all matching data as input, builds deterministic indexes, and returns only canonical ingredient names in the existing result categories. Resolve exact canonical phrases and aliases before considering a typo. When both an alias and canonical name occur in a query, category handling and deduplication operate on the canonical name.

**Alternative considered:** Resolve aliases after parsing. That can produce duplicate chips and inconsistent included/excluded categories for two names that refer to the same ingredient.

### Recognize common possession-negation phrasing

Normalize common spellings of “do not” (`don't`, `don’t`, and `dont`) as a negation phrase before token matching. Recognize “do not have” followed optionally by “any” and an ingredient phrase, so “I don’t have butter” and “I do not have any butter” classify butter as excluded. Apply the negation to the following matched canonical ingredient or alias without consuming unrelated terms. Keep this as deterministic parser logic; do not introduce a general natural-language model or external service.

**Alternative considered:** Treat only standalone “no,” “not,” and “without” as negation. This misses ordinary possession phrasing, while broad clause-level negation would be less predictable and could exclude unrelated ingredients.

### Restrict typo matching to one unambiguous edit

After exact phrase and alias matching fail, compare candidate ingredient phrase tokens using a bounded Damerau-Levenshtein distance. A token must contain at least four characters and be within one insertion, deletion, substitution, or adjacent transposition of a candidate token; at most one token in a multi-word phrase may differ. Accept only when exactly one canonical candidate qualifies. Otherwise preserve the input as unrecognized. Apply the same rule after negation so a recognized typo can be excluded.

This threshold is deterministic, handles common transpositions, and avoids guessing among nearby short words. No new package is needed; test the bounded comparison with unit cases for each edit and ambiguity.

**Alternative considered:** Use an unrestricted fuzzy score or an external spell-checking service. A broad score can silently select a semantically different ingredient, while a runtime service conflicts with the no-external-calls constraint and the pure-parser requirement.

### Preserve API and search compatibility

Keep `/api/ingredients/parse` response fields unchanged. The returned canonical values appear as editable chip labels and are sent to the existing recipe search endpoint, so search continues to compare criteria against canonical `USES` ingredients without changing its ranking or cursor semantics. Keep the existing vocabulary endpoint limited to canonical options.

**Alternative considered:** Return suggestions or confidence metadata. That would require a new response and UI state, beyond the selected auto-canonical behavior.

### Test data flow at its boundaries

Add pure parser tests for aliases, typos, negation, deduplication, and ambiguous inputs; API tests proving repository alias data reaches parsing while response shape remains stable; and import/preparation tests for alias validation and graph relationships. Use an isolated Neo4j test graph for relationship resolution and ensure tests do not touch the Compose database.

## Risks / Trade-offs

- [A valid ingredient typo may be too distant for the one-edit rule] → Prefer an unrecognized chip to an incorrect automatic correction; curated aliases cover common vocabulary variants.
- [A typo may be one edit from multiple ingredients] → Leave it unrecognized rather than select by incidental ordering.
- [Alias nodes could leak into ingredient suggestions or recipe criteria] → Return only canonical names from the vocabulary endpoint and normalize parser output before it reaches search.
- [Prepared data is regenerated and the importer requires an empty graph] → Keep the alias source outside generated outputs, test clean preparation/import, and document that loading the new relationship requires a fresh empty graph rather than clearing an existing graph automatically.

## Migration Plan

There is no in-place migration of an existing graph. Generate the prepared files with the curated alias source and import them into a fresh, empty Neo4j database using the existing import flow. Do not automatically delete or replace a developer's Compose volume. Roll back by reverting the code and restoring the prior prepared-data/import workflow; the new graph can be discarded separately if it was created only for this feature.
