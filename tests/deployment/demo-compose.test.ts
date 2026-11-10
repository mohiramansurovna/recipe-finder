import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const compose = readFileSync(resolve(root, "docker-compose.demo.yml"), "utf8");
const caddy = readFileSync(resolve(root, "Caddyfile.demo"), "utf8");
const workflow = readFileSync(
  resolve(root, ".github/workflows/demo-deployment.yml"),
  "utf8",
);

describe("demo API-only deployment", () => {
  it("proxies public HTTPS traffic to the API without client assets", () => {
    expect(compose).not.toMatch(/^\s{2}web:/m);
    expect(compose).not.toContain("web_assets");
    expect(compose).not.toContain("recipe-finder-web");
    expect(caddy).toContain("reverse_proxy api:3000");
    expect(caddy).not.toContain("file_server");
  });

  it("publishes only importer and API images", () => {
    expect(workflow).toContain("recipe-finder-importer");
    expect(workflow).toContain("recipe-finder-api");
    expect(workflow).not.toContain("recipe-finder-web");
  });

  it("uses Resend explicitly and keeps development mail capture out of the demo", () => {
    expect(compose).toContain('EMAIL_PROVIDER: "${EMAIL_PROVIDER:?Set EMAIL_PROVIDER=resend in .env.demo}"');
    expect(compose).toContain("RESEND_API_KEY");
    expect(compose).not.toMatch(/^\s{2}mailpit:/m);
    expect(compose).not.toContain("SMTP_HOST");
    expect(compose).not.toContain("SMTP_PORT");
  });
});
