# Tasks

## 1. Add an accurate search total

- [x] 1.1 Extend the recipe-search page contract with `totalCount` and return the eligible-result total before cursor filtering; update repository/API integration tests for active filters, cursor pages, and empty results.

## 2. Display the total in the web client

- [x] 2.1 Validate and render the API's total count in the results header; update UI fixtures and verify the displayed count and zero-results state in `ingredient-ui.test.tsx`.

## 3. Implement the responsive Figma layout

- [x] 3.1 Recompose the existing query, criteria, and filter controls into a search panel beside the results at wide widths and above results at narrow widths; verify existing chip/filter behavior and check for horizontal overflow at desktop, tablet, and 320px widths.
- [x] 3.2 Add the coordinated light/dark palettes and keyboard-operable theme toggle; verify both themes, the toggle's accessible action, focus visibility, and error/status styling with UI tests.

## 4. Verify the integrated change

- [x] 4.1 Run `npm run check` and `npm run build:web`; confirm the API response shape, cursor pagination, dataset attribution, and contributor-identity protections remain intact.
