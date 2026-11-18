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

  it("captures demo email in Mailpit exposed only at /mailpit behind basic auth", () => {
    expect(compose).toContain("EMAIL_PROVIDER: smtp");
    expect(compose).toContain("SMTP_HOST: mailpit");
    expect(compose).not.toContain("RESEND_API_KEY");
    const mailpit = compose.slice(compose.indexOf("  mailpit:"), compose.indexOf("  redis:"));
    expect(mailpit).toContain("MP_UI_AUTH:");
    expect(mailpit).toContain("MP_WEBROOT: /mailpit/");
    expect(mailpit).not.toContain("ports:");
    expect(caddy).toContain("handle /mailpit/*");
    expect(caddy).toContain("reverse_proxy mailpit:8025");
    expect(caddy).not.toContain("1025");
  });
});
