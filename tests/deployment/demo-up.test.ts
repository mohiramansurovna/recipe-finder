import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];
const launchScript = readFileSync(resolve(root, "scripts/demo-up.sh"), "utf8");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runBash(script: string, ...args: string[]) {
  return spawnSync("bash", ["-c", script, "test", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("demo launch safety gates", () => {
  it.each([
    ["198.51.100.8/32", false],
    ["10.0.0.4/32", false],
    ["203.0.113.8/24", false],
    ["999.1.1.1/32", false],
    ["8.8.8.8/32", true],
  ])("validates public SSH CIDR %s", (cidr, valid) => {
    const result = runBash(
      'source "$1"; demo_validate_public_ipv4_cidr "$2"',
      resolve(root, "scripts/demo-lib.sh"),
      cidr,
    );
    expect(result.status === 0).toBe(valid);
  });

  it("blocks provisioning while the review has unchecked items", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "recipe-demo-review-"));
    temporaryDirectories.push(directory);
    mkdirSync(resolve(directory, "docs"));
    const review = readFileSync(resolve(root, "docs/demo-security-review.md"), "utf8");
    writeFileSync(
      resolve(directory, "docs/demo-security-review.md"),
      review.replace("- [x]", "- [ ]"),
    );
    const result = runBash(
      'DEMO_ROOT_DIR="$2"; source "$1"; demo_review_is_complete',
      resolve(root, "scripts/demo-lib.sh"),
      directory,
    );
    expect(result.status).not.toBe(0);
  });

  it("fails safely before AWS access when the operator config is absent", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "recipe-demo-up-"));
    temporaryDirectories.push(directory);
    const result = spawnSync("bash", [resolve(root, "scripts/demo-up.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        DEMO_CONFIG_FILE: resolve(directory, "missing.env"),
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("configuration file not found");
  });

  it("writes the deployment environment with root-only permissions and verifies SSH host keys", () => {
    expect(launchScript).toContain("StrictHostKeyChecking=yes");
    expect(launchScript).not.toContain("StrictHostKeyChecking=no");
    expect(launchScript).toContain("sudo sh -c 'umask 077; cat > /opt/recipe-graph/.env.demo'");
    expect(launchScript).toContain("sudo chown ubuntu:ubuntu /opt/recipe-graph");
  });

  it("accepts an image revision only when its application build inputs match the checkout", () => {
    const result = runBash(
      'DEMO_ROOT_DIR="$1"; DEMO_IMAGE_TAG="$(git rev-parse HEAD)"; source scripts/demo-lib.sh; demo_image_source_matches_checkout',
      root,
    );
    expect(result.status, result.stderr).toBe(0);
  });
});
