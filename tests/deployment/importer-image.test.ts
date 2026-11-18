import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const dockerfile = readFileSync(resolve(root, "Dockerfile"), "utf8");
const copied = new Set(
  [...dockerfile.matchAll(/^COPY\s+(?:--\S+\s+)*(\S+)\s+\S+\s*$/gm)].map((match) => match[1]),
);

function localImports(file: string): string[] {
  const source = readFileSync(resolve(root, file), "utf8");
  return [...source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)].map((match) => {
    const target = resolve(dirname(resolve(root, file)), match[1]).replace(/\.js$/, ".ts");
    return relative(root, target);
  });
}

function closure(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const pending = [...entries];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file) || !existsSync(resolve(root, file))) continue;
    seen.add(file);
    pending.push(...localImports(file));
  }
  return seen;
}

describe("importer image", () => {
  it("copies every source file the import and migration scripts load", () => {
    const needed = closure(["scripts/import-data.ts", "scripts/migrate-account-schema.ts"]);
    const missing = [...needed].filter((file) => !copied.has(file));
    expect(missing).toEqual([]);
  });
});
