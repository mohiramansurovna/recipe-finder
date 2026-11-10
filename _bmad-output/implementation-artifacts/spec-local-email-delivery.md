---
title: 'Use Mailpit for Local Account Email'
type: 'feature'
created: '2026-11-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7309ba9cc0a9ce5672b8b294f970cab314697e08'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-register-and-verify-a-password-account.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Local account registration currently calls Resend, which requires an API key and verified sender domain; without those, developers cannot receive verification messages in the local setup.

**Approach:** Route local Compose account email through Mailpit so developers can inspect verification messages in a local inbox without external email credentials. Keep Resend for the demo/production deployment and preserve the existing account persistence and delivery-failure behavior.

## Boundaries & Constraints

**Always:** Local Compose uses Mailpit SMTP and exposes its web inbox only on loopback. Demo/production continues to use Resend with its verified sender and API key. Keep provider selection explicit and validate only the configuration required by the selected provider. Preserve account creation before delivery, existing public responses, verification-code privacy, and resend non-enumeration. Do not persist or log raw codes outside the local Mailpit inbox.

**Never:** Roll back registration after delivery failure, change resend responses or rate limits, send local development email through an external provider, expose Mailpit or Neo4j publicly, or make Mailpit part of demo/production deployment.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local registration | Compose running with Mailpit; valid new account details | Registration persists the account and challenge; verification email appears in Mailpit's inbox | SMTP failure retains the account and uses the existing registration delivery error |
| Local resend | Eligible local account and Mailpit available | Same public resend response; replacement email appears in Mailpit | SMTP failure remains hidden behind the existing non-enumerating response |
| Demo startup | Resend configuration and verified sender supplied | API selects Resend; Mailpit is not required | Missing selected-provider configuration fails startup clearly |

</frozen-after-approval>

## Code Map

- `api/src/application/services/accounts.service.ts` -- Provider-neutral mailer port and account delivery boundaries; preserve commit-before-send and current failure behavior.
- `api/src/infrastructure/accounts/resend-verification-mailer.ts` -- Existing Resend adapter to keep for demo/production.
- `api/src/index.ts` -- Environment validation and composition root; select only the configured mail adapter.
- `docker-compose.yml` and `.env.example` -- Local Compose Mailpit service, SMTP configuration, and loopback-only inbox.
- `docker-compose.demo.yml` and `.env.demo.example` -- Keep the demo explicitly configured for Resend and independent of Mailpit.
- `README.md` -- Document local inbox access and distinguish local email settings from demo settings.
- `tests/accounts-api.integration.test.ts` and `tests/deployment/` -- Reuse mailer fakes and Compose contract tests to cover adapter selection and deployment isolation.
- `package.json` -- Add an SMTP client dependency only if needed by the selected adapter.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/infrastructure/accounts/` and `api/src/index.ts` -- Add a Mailpit-compatible SMTP adapter and explicit provider selection -- keep transport details out of routes and preserve Resend.
- [x] `docker-compose.yml` and `.env.example` -- Add Mailpit to the local stack with loopback-only web access and local SMTP configuration -- allow local signup without a domain or Resend key.
- [x] `docker-compose.demo.yml` and `.env.demo.example` -- Keep Resend as the explicit demo provider -- prevent development-only mail capture from entering production.
- [x] `tests/accounts-api.integration.test.ts` and `tests/deployment/` -- Verify provider configuration, delivery contracts, and Compose isolation -- prevent regression in registration/resend behavior.
- [x] `README.md` -- Explain how to inspect local verification email and configure demo Resend -- make the workflow usable without a verified local domain.

**Acceptance Criteria:**
- Given local Compose is running, when a developer registers a new account, then the verification message is visible in Mailpit without a Resend API key or verified domain.
- Given local registration email delivery fails, when registration returns, then the existing account persistence and explicit delivery-failure response remain unchanged.
- Given a local resend request, when the account is eligible, then Mailpit receives the replacement email while the public response stays non-enumerating.
- Given the demo environment starts, when Resend credentials and sender are configured, then Resend remains the selected provider and Mailpit is not required.
- Given local email services are exposed, when the stack starts, then Mailpit's web interface is reachable only from the host loopback address.

## Implementation Notes

Email provider selection is required at API startup. Local Compose selects SMTP and sends through the Mailpit service; the demo selects Resend. Provider-specific settings are validated only for the selected provider.

## Verification

**Commands:**
- `npm run check` -- passed: lint, type-check, and 171 tests; 2 graph-dependent tests skipped.
- `npm run build:api` -- passed: API build succeeds with the SMTP adapter and provider selection.
- `npx vitest run tests/accounts-mailer.test.ts tests/deployment/local-compose.test.ts` -- passed: 9 tests, including SMTP endpoint wiring and Mailpit readiness dependency.
- `docker compose --env-file .env.example config --quiet` with validation-only Neo4j and verification-secret values -- passed.
- `docker compose -f docker-compose.demo.yml --env-file .env.demo.example config --quiet` with validation-only Resend, sender, Neo4j, and hostname values -- passed.
- Mailpit SMTP smoke test -- passed: the adapter sent a message to Mailpit and its inbox API returned the expected recipient, subject, and body.

**Manual checks:**
- Not run: full local Compose account registration and resend require the prepared graph data; their account persistence and public response contracts are covered by API tests.
- Demo provider and Mailpit isolation were verified by Compose contract tests and Compose configuration validation.

## Review Triage Log

- **low / patch — Mailpit startup readiness:** Compose originally waited only for the Mailpit container to start, not for its SMTP listener to become ready; the API now waits for the image's built-in health check, and the local Compose contract test pins that dependency.
- **low / patch — SMTP endpoint test gap:** Provider selection tests verified the SMTP adapter type but not the Nodemailer host and port; added an assertion that the factory supplies the configured Mailpit host and port.
