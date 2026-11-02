# Architecture

## Flow
browser -> Caddy -> API (Express) -> Neo4j
Caddy -> built React/Vite assets

## Components
- web: React + Vite. The Compose web build publishes static assets to a
  shared volume that Caddy serves.
- api: Node.js, TypeScript, Express. Zod validates requests; the API
  parses ingredient text against normalized Ingredient names in Neo4j and
  provides cursor-paginated recipe search over the Recipe/Ingredient graph.
  Search ranks by missing and matched ingredients, then excluded matches
  and stable recipe ID. Vitest and Supertest cover parser, search, API,
  and UI behavior.
- neo4j: Neo4j Community in Docker with explicit memory limits.
- caddy: serves the frontend and reverse proxies /api to the API.
  Handles HTTPS in the demo.

## Environments
- Local: `docker compose up --build` starts Neo4j, imports prepared CSV
  files, starts the API after import, and serves the web app at
  `http://localhost:8080` by default. Data acquisition and preparation
  are run separately. Neo4j's Bolt port and the web port bind to loopback;
  the API is reachable only through Caddy on the private Compose network.
- Current behavior: users can parse text, edit included, excluded, and
  unrecognized ingredient chips, and search recipes ranked by ingredient
  fit. Chip edits and time-limit changes restart the search; result pages
  are loaded with cursor pagination.
- Demo (AWS): created with Terraform, destroyed afterwards.
  - Persistent stack: S3 bucket for CSVs, OIDC role, budget alert.
  - Demo stack: EC2, security group, Elastic IP, IAM instance profile.
- Images are built in GitHub Actions and stored in GHCR.

## Non-functional requirements
- Performance: first page of a typical search in about one second on demo
  hardware (assumption to be validated).
- Reproducibility: a clean clone plus the data files reaches a working app
  with one command.
- Security: database never exposed publicly, secrets never in the
  repository, public API rate limited.
- Testability: the text parser is a pure function with unit tests, and
  search is covered by integration tests against a test graph.
- Accessibility: chips can be added, removed and toggled by keyboard.
- Cost: the demo stack exists only while demoing, and a budget alert is set
  before the first deploy.