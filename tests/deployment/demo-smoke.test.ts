import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeCurlStub(response: string) {
  const directory = mkdtempSync(join(tmpdir(), "recipe-demo-smoke-"));
  temporaryDirectories.push(directory);
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const curlPath = join(bin, "curl");
  writeFileSync(
    curlPath,
    `#!/bin/sh\ncase "$*" in\n  *"/api/recipes/search") printf '%s' "$MOCK_SEARCH_RESPONSE" ;;\n  *"/health") printf '{"status":"ok"}' ;;\n  *) exit 1 ;;\nesac\n`,
  );
  chmodSync(curlPath, 0o755);
  return { directory, path: `${bin}${delimiter}${process.env.PATH ?? ""}`, response };
}

describe("public demo smoke check", () => {
  it("checks API health and accepts a valid HTTPS search response", () => {
    const mock = makeCurlStub(
      JSON.stringify({
        recipes: [{
          id: "1",
          name: "Chicken",
          minutes: 30,
          matchedIngredients: ["chicken"],
          missingIngredients: ["salt"],
          excludedIngredients: [],
        }],
        totalCount: 1,
        nextCursor: null,
      }),
    );
    const result = spawnSync(
      "bash",
      [resolve(root, "scripts/demo-smoke.sh"), "https://demo.example.test"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: mock.path,
          MOCK_SEARCH_RESPONSE: mock.response,
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("1 matching recipes");
  });

  it("fails when search returns no recipes", () => {
    const mock = makeCurlStub(
      JSON.stringify({ recipes: [], totalCount: 0, nextCursor: null }),
    );
    const result = spawnSync(
      "bash",
      [resolve(root, "scripts/demo-smoke.sh"), "https://demo.example.test"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: mock.path,
          MOCK_SEARCH_RESPONSE: mock.response,
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Recipe search returned no matching recipes");
  });

  it("rejects non-empty search results with malformed recipe objects", () => {
    const mock = makeCurlStub(
      JSON.stringify({
        recipes: [{}],
        totalCount: 1,
        nextCursor: null,
      }),
    );
    const result = spawnSync(
      "bash",
      [resolve(root, "scripts/demo-smoke.sh"), "https://demo.example.test"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: mock.path,
          MOCK_SEARCH_RESPONSE: mock.response,
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("malformed recipe");
  });

  it("rejects a non-HTTPS URL", () => {
    const result = spawnSync(
      "bash",
      [resolve(root, "scripts/demo-smoke.sh"), "http://demo.example.test"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });
});
