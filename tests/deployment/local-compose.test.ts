import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");

describe("local Compose network boundaries", () => {
  it("binds the Neo4j Bolt and web ports to loopback", () => {
    expect(compose).toContain('"127.0.0.1:${NEO4J_BOLT_PORT:-7687}:7687"');
    expect(compose).toContain('"127.0.0.1:${APP_PORT:-8080}:80"');
  });

  it("does not publish the API or Neo4j browser ports", () => {
    expect(compose).not.toMatch(/^\s+- ["']?0\.0\.0\.0:.*:(3000|7474|7473|7687):/m);
    expect(compose).not.toContain('"7474:7474"');
    expect(compose).not.toContain('"7687:7687"');
    expect(compose).not.toContain('"3000:3000"');
  });
});
