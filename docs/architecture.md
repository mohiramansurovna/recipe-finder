# Architecture

## Flow
browser -> Caddy -> API (Express) -> Neo4j

## Components
- web: React + Vite. Built to static files and served by Caddy.
- api: Node.js, TypeScript, Express. Zod validates requests.
  Vitest and Supertest for tests.
- neo4j: Neo4j Community in Docker with explicit memory limits.
- caddy: serves the frontend and reverse proxies /api to the API.
  Handles HTTPS in the demo.

## Environments
- Local: `docker compose up` starts Neo4j and imports prepared CSV files.
  Data acquisition and preparation are run separately; later releases add
  the API and frontend to the Compose stack.
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