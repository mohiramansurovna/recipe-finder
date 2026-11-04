# Recipe Graph: Product Requirements Document

## 1. Summary
People often look at what is in their kitchen and cannot decide what to cook. Recipe sites search by dish name, not by the ingredients you actually have. Recipe Graph lets a user type what they have in plain text, shows exactly which ingredients the app understood (and lets the user fix them), and then lists recipes ranked by how few ingredients are missing.

The recipe data lives in a graph database (Neo4j) that we run ourselves. There are no external APIs and no LLM at runtime in the first versions.

## 2. Goals and non-goals

### Goals
- Ingredient-first recipe discovery: "I have chicken, rice and spinach" returns recipes sorted by fewest missing ingredients.
- Transparent interpretation: the user always sees, and can edit, the included and excluded ingredients the app extracted from their text.
- Fully reproducible: docker compose up builds the database from CSV files and starts the whole app.
- A live demo on AWS that is created with one command and destroyed with one command, leaving nothing behind and keeping cost near zero.

### Non-goals (first versions)
- No LLM calls at runtime. This may be revisited if text matching proves too weak.
- No user accounts, logins or user-submitted recipes until the personalization release.
- No mobile app, no nutrition or health advice, no production-scale operations.
- No production-grade AWS architecture (custom VPC, load balancer, CDN, autoscaling). The demo is one small server. These are a possible future hardening release.
- No display of recipe contributors' identities. The dataset only has anonymous IDs and we keep it that way.

## 3. Users
- Home cook with a few ingredients on hand who wants quick ideas.
- Reviewer (manager, interviewer, or peer) who opens the demo or clones the repo and expects it to run in minutes.

## 4. Core user journeys
1. Search by text. The user types "chicken, rice, spinach, no butter". The app shows chips: included (chicken, rice, spinach), excluded (butter), and not recognized (anything it could not match). The user can remove a chip, add one, or flip it between included and excluded. Every edit refreshes the results.
2. Browse results. Results scroll without a page limit. Each card shows the title, cooking time, matched ingredients, and missing ingredients.
3. Filter by time. The user limits results to up to 15, 30, or 60 minutes.
4. Later: personalize. The user marks recipes as cooked, rates them, flags disliked ingredients, and sees results reordered to fit their taste.

## 5. Release roadmap
- R0 Foundation. Repository, Docker Compose with Neo4j, data preparation script, and bulk import from CSV.
- R1 MVP. Text to editable keywords, graph search ranked by fewest missing ingredients, infinite scroll, time filter, source attribution.
- R2 Better matching. Aliases (scallion and green onion), typo tolerance, staples such as salt and oil not counted as missing, rarity weighting, minimum match threshold.
- R3 Demo deployment. One Terraform stack on AWS (EC2, security group, Elastic IP, key pair), CI that builds public images to GHCR, automatic HTTPS, demo-up and demo-down scripts, and a destroy checklist. The first demo-ready point.
- R4 Filters and substitutions. Ingredient categories (dairy, nuts, meat) for exclusions like "no dairy" and vegetarian, cuisine filter, and substitution suggestions.
- R5 Recipe details and ratings. Show full recipe details and reviews. Do not add accounts or logins. Do not allow users to send reviews.
- R6 Clean architecture. Refactor the codebase into a modular structure with clear boundaries between data, API and UI.

## 6. Feature specs map
This is a greenfield project. Each item below is one OpenSpec change, built strictly in order. Each is a vertical slice (data, API and UI where relevant). A change is archived before the next one starts, so the specs in openspec/specs/ build up as the system grows.

- 001 data-prep-and-import (R0)
- 002 compose-environment (R0)
- 003 ingredient-parsing-and-chips (R1)
- 004 recipe-search-and-results (R1)
- 005 aliases-and-typo-tolerance (R2)
- 006 categories-and-filters (R4)
- 007 ui-design-implementation (R2)
- 008 demo-deployment (R3)
- 009 recipe-detail-and-reviews (R5)
- 010 modular-structure-refactor (R6)

Scope of 008 demo-deployment: the Terraform stack, the server bootstrap (user data), the GHCR image build workflow, the Caddy HTTPS configuration, the demo-up script (apply, copy CSVs, import, start) and the demo-down script (destroy), and the destroy checklist.

## 7. Functional requirements
- FR-1 Parse free text into three lists: included ingredients, excluded ingredients, and unrecognized words.
- FR-2 Show the three lists as editable chips. Editing a chip triggers a new search without retyping the text.
- FR-3 Rank recipes by fewest missing ingredients, then by most matched ingredients, with a stable tie-breaker.
- FR-4 Return results in pages using cursor-based pagination, presented as infinite scroll.
- FR-5 Show cooking time on each card and support time filters (up to 15, 30, 60 minutes, and longer).
- FR-6 Credit the data source in the UI, as the dataset license requires.
- FR-7 Never show or store personal data about recipe contributors.

## 8. Non-functional requirements
- Performance: a typical search returns its first page in about one second on demo hardware (assumption to be validated).
- Reproducibility: a clean clone plus the data files reaches a working app with one command.
- Security: the database is never exposed publicly (its ports are not opened and it is reachable only on the Docker network), secrets are never in the repository, the public API is rate limited, and SSH access to the demo server is limited to the operator's IP address.
- Testability: the text parser is a pure function with unit tests, and search is covered by integration tests against a test graph.
- Accessibility: chips can be added, removed and toggled by keyboard.
- Cost: the demo stack exists only while demoing, and a budget alert is set before the first deploy.
- Clean teardown: one destroy command removes every AWS resource the demo created, including any IAM roles and policies. Nothing is shared with, or left in, the account afterwards.

## 9. Data
- Source: the Food.com Recipes and Interactions dataset from Kaggle.
- Used columns: name, id, minutes, tags, ingredients, and later the ratings file.
- Graph model: Recipe uses Ingredient; Recipe is in Cuisine; Ingredient is an alias of or substitute for Ingredient. Users and ratings are added in R5. Details are in docs/data-model.md.
- Preparation: a one-time script cleans ingredient names, merges variants, flags staples, handles cooking-time outliers, and outputs graph-ready CSV files that are bulk imported into Neo4j.
- Storage: the prepared CSV files stay on the developer's machine and are not committed to the repository. For the demo they are copied directly to the server over SSH and imported there. No cloud storage is used for data.

## 10. Technical direction
These decisions belong in each change's design step, not in the specs themselves.
- TypeScript on Node.js with Express, Zod for request validation, Vitest and Supertest for tests.
- React with Vite for the frontend. Caddy serves the built static files, proxies /api to the Express container, and obtains HTTPS certificates automatically.
- Neo4j Community in Docker, with the whole stack defined in Docker Compose.
- Images built in GitHub Actions with the built-in GITHUB_TOKEN and stored in GHCR as public packages. They contain no secrets, so the server pulls them without credentials. No AWS access is needed from CI.
- Terraform with a single stack and local state (gitignored), run from the developer's machine:
  - Resources: EC2 instance, security group, Elastic IP and its association, key pair created from the developer's own public key, and the budget alert.
  - No S3 bucket, no OIDC role, and no IAM instance profile unless a later change needs one. Because everything is in one state, a single terraform destroy removes all of it.
  - A dedicated VPC, public subnet, Internet Gateway and route table are created and destroyed in the same Terraform state. There is no NAT gateway, load balancer or CloudFront.
  - The Neo4j password is generated by Terraform and written to the server's environment file.
  - Security group: ports 80 and 443 open to the internet, port 22 open only to the operator's IP (a Terraform variable), and no Neo4j ports.
  - The Elastic IP is created first and its address is passed to the server bootstrap, so Caddy can use a hostname of the form <ip-with-dashes>.sslip.io and get a real certificate without owning a domain.
- Demo flow: demo-up runs terraform apply, waits for SSH, copies the CSV files with rsync, runs the compose import service on the server, and starts the stack. demo-down runs terraform destroy.
- Instance sizing: about 4 GB of memory (for example t3.medium) with explicit Neo4j heap and page-cache limits and a small gp3 root volume. Pricing is verified before the first apply.

## 11. Success criteria
- A clean clone reaches a working app with docker compose up in about 15 minutes, including import.
- The parser correctly interprets at least 90% of a fixed set of about 30 test queries (target to be confirmed once the test set exists).
- The live demo works end to end over HTTPS, then terraform destroy leaves no resources behind in the AWS account.
- Total demo cost stays under a small budget set in advance (for example 5 dollars).
- Every feature has an archived OpenSpec change.

## 12. Risks and open questions
- Ingredient normalization quality is the biggest risk. Mitigation: editable chips, aliases, typo tolerance, and an LLM fallback only if needed.
- "No dairy" style exclusions need ingredient categories, so they arrive in R4. Until then, only specific ingredients can be excluded.
- Neo4j memory on a small instance. Mitigation: trim the dataset and set memory limits explicitly.
- Copilot usage limits. Mitigation: small tasks, commit after each task.
- Local Terraform state: if the state file is lost before destroy, the resources become orphans in the account. Mitigation: keep the state file until demo-down has succeeded, and record a manual cleanup list in the destroy checklist.
- Forgetting to destroy the demo. Mitigation: the budget alert, plus a calendar reminder when a demo is started.
- Public SSH exposure if the operator's IP changes. Mitigation: the IP is a variable and must be updated before each apply; SSM Session Manager is a possible alternative later.
- Free sslip.io hostnames share Let's Encrypt rate limits with other users. Mitigation: a real domain can replace it if a certificate cannot be issued.
- Re-importing data on every demo costs a few minutes. Accepted for now, because it keeps the demo identical to the local development path.