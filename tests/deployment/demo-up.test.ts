import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
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

function writeExecutable(path: string, content: string) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function makeValidCurrentReview(readme: string) {
  return readme
    .replace(
      "- [ ] Re-review the current deployment code and configuration before any new provisioning; the 2026-11-04 review does not cover these changes.",
      "- [x] Re-review the current deployment code and configuration before any new provisioning; the 2026-11-04 review does not cover these changes.",
    )
    .replace("**Current deployment reviewer**: _Not reviewed_", "**Current deployment reviewer**: Test Operator")
    .replace("**Current deployment review date**: _Not reviewed_", "**Current deployment review date**: 2026-11-07")
    .replace(
      "**Current approval to provision billable AWS resources**: _Not granted_",
      "**Current approval to provision billable AWS resources**: Granted for this deployment on 2026-11-07",
    );
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

  it("does not accept the historical reviewer, date, and approval as a current review", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "recipe-demo-review-"));
    temporaryDirectories.push(directory);
    writeFileSync(resolve(directory, "README.md"), makeValidCurrentReview(
      readFileSync(resolve(root, "README.md"), "utf8"),
    ).replace("**Current deployment reviewer**: Test Operator", "**Reviewer**: Operator (confirmed in chat)")
      .replace("**Current deployment review date**: 2026-11-07", "**Review date**: 2026-11-04")
      .replace(
        "**Current approval to provision billable AWS resources**: Granted for this deployment on 2026-11-07",
        "**Historical approval to provision billable AWS resources**: Granted by operator for the demo launched on 2026-11-04 only.",
      ));
    const result = runBash(
      'DEMO_ROOT_DIR="$2"; source "$1"; demo_review_is_complete',
      resolve(root, "scripts/demo-lib.sh"),
      directory,
    );
    expect(result.status).not.toBe(0);
  });

  it("requires every listed review item to be checked", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "recipe-demo-review-items-"));
    temporaryDirectories.push(directory);
    const readme = makeValidCurrentReview(
      readFileSync(resolve(root, "README.md"), "utf8"),
    ).replace(
      "- [x] Confirm the SSH host key is verified against AWS-authenticated console output and host-key checking is enabled.",
      "- [ ] Confirm the SSH host key is verified against AWS-authenticated console output and host-key checking is enabled.",
    );
    writeFileSync(resolve(directory, "README.md"), readme);
    const result = runBash(
      'DEMO_ROOT_DIR="$2"; source "$1"; demo_review_is_complete',
      resolve(root, "scripts/demo-lib.sh"),
      directory,
    );
    expect(result.status).not.toBe(0);
  });

  it("requires ratings.csv before allowing a demo launch", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "recipe-demo-missing-ratings-"));
    temporaryDirectories.push(directory);
    const preparedData = resolve(directory, "prepared");
    mkdirSync(preparedData);
    for (const file of [
      "recipes.csv",
      "ingredients.csv",
      "recipe_ingredients.csv",
      "ingredient_aliases.csv",
      "ingredient_categories.csv",
      "recipe_cuisines.csv",
    ]) writeFileSync(resolve(preparedData, file), "");
    const publicKey = resolve(directory, "operator.pub");
    writeFileSync(publicKey, "ssh-ed25519 test\n");
    writeFileSync(resolve(directory, ".env.demo"), [
      "DEMO_REGION=us-east-1",
      "DEMO_SSH_CIDR=8.8.8.8/32",
      `DEMO_PUBLIC_KEY_PATH=${publicKey}`,
      "DEMO_GHCR_OWNER=example",
      `PREPARED_DATA_DIR=${preparedData}`,
      `DEMO_IMAGE_TAG=${"a".repeat(40)}`,
      "DEMO_ESTIMATED_COST_USD=1",
      "DEMO_BUDGET_LIMIT_USD=5",
      "DEMO_BUDGET_EMAIL=operator@example.com",
      "EMAIL_PROVIDER=resend",
      "RESEND_API_KEY=re_test",
      "EMAIL_FROM=recipe@example.com",
      "VERIFICATION_CODE_SECRET=12345678901234567890123456789012",
    ].join("\n"));
    const result = runBash(
      'DEMO_ROOT_DIR="$1"; DEMO_CONFIG_FILE="$1/.env.demo"; source "$2"; demo_read_config; demo_image_source_matches_checkout() { return 0; }; demo_review_is_complete() { return 0; }; demo_validate_configuration',
      directory,
      resolve(root, "scripts/demo-lib.sh"),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("prepared data file is missing:");
    expect(result.stderr).toContain("ratings.csv");
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

  it("fails launch when the API search smoke check fails", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "recipe-demo-search-failure-"));
    temporaryDirectories.push(directory);
    const scripts = resolve(directory, "scripts");
    const bin = resolve(directory, "bin");
    const preparedData = resolve(directory, "data/prepared");
    mkdirSync(scripts);
    mkdirSync(bin);
    mkdirSync(preparedData, { recursive: true });
    mkdirSync(resolve(directory, "infra"));

    for (const script of ["demo-up.sh", "demo-lib.sh", "demo-smoke.sh"]) {
      writeFileSync(
        resolve(scripts, script),
        readFileSync(resolve(root, "scripts", script)),
      );
      chmodSync(resolve(scripts, script), 0o755);
    }

    const reviewedReadme = makeValidCurrentReview(
      readFileSync(resolve(root, "README.md"), "utf8"),
    );
    writeFileSync(resolve(directory, "README.md"), reviewedReadme);

    const sshPublicKey = resolve(directory, "ssh/demo.pub");
    mkdirSync(resolve(directory, "ssh"));
    writeFileSync(sshPublicKey, "ssh-ed25519 test\n");
    writeFileSync(resolve(directory, "ssh/demo"), "private-key-placeholder\n");
    const imageTag = "a".repeat(40);
    writeFileSync(
      resolve(directory, ".env.demo"),
      [
        "DEMO_REGION=us-east-1",
        "DEMO_SSH_CIDR=8.8.8.8/32",
        `DEMO_PUBLIC_KEY_PATH=${sshPublicKey}`,
        "DEMO_GHCR_OWNER=example",
        `PREPARED_DATA_DIR=${preparedData}`,
        `DEMO_IMAGE_TAG=${imageTag}`,
        "DEMO_ESTIMATED_COST_USD=1",
        "DEMO_BUDGET_LIMIT_USD=5",
        "DEMO_BUDGET_EMAIL=operator@example.com",
        "EMAIL_PROVIDER=resend",
        "RESEND_API_KEY=re_test",
        "EMAIL_FROM=recipe@example.com",
        "VERIFICATION_CODE_SECRET=12345678901234567890123456789012",
      ].join("\n"),
    );
    for (const file of [
      "recipes.csv",
      "ratings.csv",
      "ingredients.csv",
      "recipe_ingredients.csv",
      "ingredient_aliases.csv",
      "ingredient_categories.csv",
      "recipe_cuisines.csv",
    ]) {
      writeFileSync(resolve(preparedData, file), "");
    }

    writeExecutable(
      resolve(bin, "git"),
      `#!/usr/bin/env bash
case "$*" in
  *"rev-parse HEAD"*) printf '%s\\n' '${imageTag}' ;;
  *"rev-parse --verify"*) printf '%s\\n' '${imageTag}' ;;
  *"diff --quiet"*) exit 0 ;;
  *) exit 1 ;;
esac
`,
    );
    writeExecutable(
      resolve(bin, "terraform"),
      `#!/usr/bin/env bash
case "$*" in
  *"output -raw instance_id"*) printf 'i-demo\\n' ;;
  *"output -raw public_ip"*) printf '203.0.113.10\\n' ;;
  *"output -raw public_hostname"*) printf 'demo.example.test\\n' ;;
  *"output -raw neo4j_password"*) printf 'test-password\\n' ;;
  *) exit 0 ;;
esac
`,
    );
    writeExecutable(
      resolve(bin, "aws"),
      `#!/usr/bin/env bash
case "$*" in
  *"get-console-output"*) printf '%s\\n' 'DEMO_SSH_HOST_KEY_SHA256=SHA256:fingerprint' ;;
  *) exit 0 ;;
esac
`,
    );
    writeExecutable(
      resolve(bin, "ssh-keyscan"),
      "#!/usr/bin/env bash\nprintf '%s\\n' '203.0.113.10 ssh-ed25519 test-key'\n",
    );
    writeExecutable(
      resolve(bin, "ssh-keygen"),
      "#!/usr/bin/env bash\nprintf '%s\\n' '256 SHA256:fingerprint host (ED25519)'\n",
    );
    writeExecutable(
      resolve(bin, "ssh"),
      `#!/usr/bin/env bash
case "$*" in
  *"ps -a"*) printf 'importer 0\\n' ;;
  *) exit 0 ;;
esac
`,
    );
    const transferredFiles = resolve(directory, "transferred-files.log");
    writeExecutable(
      resolve(bin, "rsync"),
      `#!/usr/bin/env bash
if [[ "$*" == *"--files-from=-"* ]]; then
  while IFS= read -r file; do printf '%s\\n' "$file" >> '${transferredFiles}'; done
fi
exit 0
`,
    );
    const curlLog = resolve(directory, "curl-requests.log");
    writeExecutable(
      resolve(bin, "curl"),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> '${curlLog}'
case "$*" in
  *"/api/recipes/search"*) printf '%s\\n' '{"recipes":[],"totalCount":0,"nextCursor":null}' ;;
  *) exit 0 ;;
esac
`,
    );

    const result = spawnSync("bash", [resolve(scripts, "demo-up.sh")], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      },
      input: "CREATE BILLABLE AWS RESOURCES\n",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Recipe search returned no matching recipes");
    expect(result.stdout).not.toContain("Demo ready");
    expect(readFileSync(transferredFiles, "utf8").trim().split("\n")).toEqual([
      "recipes.csv",
      "ratings.csv",
      "ingredients.csv",
      "recipe_ingredients.csv",
      "ingredient_aliases.csv",
      "ingredient_categories.csv",
      "recipe_cuisines.csv",
    ]);
    const readinessProbes = readFileSync(curlLog, "utf8")
      .trim()
      .split("\n")
      .filter((line) => line.includes("--connect-timeout"));
    expect(readinessProbes).toHaveLength(2);
    for (const probe of readinessProbes) {
      expect(probe).toContain("--connect-timeout 5");
      expect(probe).toContain("--max-time 15");
    }
  });

  it("writes the deployment environment with root-only permissions and verifies SSH host keys", () => {
    expect(launchScript).toContain("StrictHostKeyChecking=yes");
    expect(launchScript).not.toContain("StrictHostKeyChecking=no");
    expect(launchScript).toContain('"EMAIL_PROVIDER=$EMAIL_PROVIDER"');
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
