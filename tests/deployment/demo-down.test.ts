import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];
const stateResources = [
  "aws_budgets_budget.demo",
  "aws_eip.demo",
  "aws_eip_association.demo",
  "aws_instance.demo",
  "aws_internet_gateway.demo",
  "aws_key_pair.operator",
  "aws_route_table.demo_public",
  "aws_route_table_association.demo_public",
  "aws_security_group.demo",
  "aws_subnet.demo_public",
  "aws_vpc.demo",
].join("\n");

function makeDemoProject(terraformBehavior: string, awsBehavior: string) {
  const project = mkdtempSync(resolve(tmpdir(), "recipe-demo-down-project-"));
  temporaryDirectories.push(project);
  mkdirSync(join(project, "scripts"));
  mkdirSync(join(project, "infra"), { recursive: true });
  mkdirSync(join(project, "bin"));
  writeFileSync(
    join(project, "scripts/demo-lib.sh"),
    readFileSync(resolve(root, "scripts/demo-lib.sh")),
  );
  const scriptPath = join(project, "scripts/demo-down.sh");
  writeFileSync(scriptPath, readFileSync(resolve(root, "scripts/demo-down.sh")));
  chmodSync(scriptPath, 0o755);
  writeFileSync(join(project, "infra/terraform.tfstate"), "{}");
  writeFileSync(
    join(project, ".env.demo"),
    [
      "DEMO_REGION=us-east-1",
      "DEMO_SSH_CIDR=8.8.8.8/32",
      "DEMO_PUBLIC_KEY_PATH=/tmp/demo-key.pub",
      "DEMO_BUDGET_EMAIL=operator@example.com",
    ].join("\n"),
  );
  writeFileSync(
    join(project, "bin/terraform"),
    `#!/bin/sh\n${terraformBehavior}\n`,
  );
  writeFileSync(join(project, "bin/aws"), `#!/bin/sh\n${awsBehavior}\n`);
  chmodSync(join(project, "bin/terraform"), 0o755);
  chmodSync(join(project, "bin/aws"), 0o755);
  return { project, scriptPath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("demo teardown safety", () => {
  it("refuses to guess resource IDs when local Terraform state is missing", () => {
    const mock = makeDemoProject("", "");
    rmSync(join(mock.project, "infra/terraform.tfstate"));
    const result = spawnSync("bash", [mock.scriptPath], {
      cwd: mock.project,
      encoding: "utf8",
      env: {
        ...process.env,
        DEMO_ROOT_DIR: mock.project,
        PATH: `${join(mock.project, "bin")}:${process.env.PATH ?? ""}`,
      },
      input: "",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("local Terraform state is missing");
    expect(result.stderr).toContain("README.md");
  });

  it("preserves Terraform state and reports recovery when destroy fails", () => {
    const mock = makeDemoProject(
      `
args="$*"
case "$args" in
  *" init") exit 0 ;;
  *" state list") cat <<'STATE_RESOURCES'
${stateResources}
STATE_RESOURCES
 ;;
  *" output -raw instance_id") printf 'i-demo\\n' ;;
  *" output -raw vpc_id") printf 'vpc-demo\\n' ;;
  *" output -raw security_group_id") printf 'sg-demo\\n' ;;
  *" output -raw elastic_ip_allocation_id") printf 'eipalloc-demo\\n' ;;
  *" output -raw key_name") printf 'demo-key\\n' ;;
  *" output -raw budget_name") printf 'demo-budget\\n' ;;
  *" destroy -auto-approve") exit 1 ;;
  *) exit 2 ;;
esac`,
      `if [ "$1" = "sts" ]; then printf '123456789012\\n'; exit 0; fi\nexit 2`,
    );
    const result = spawnSync("bash", [mock.scriptPath], {
      cwd: mock.project,
      encoding: "utf8",
      env: {
        ...process.env,
        DEMO_ROOT_DIR: mock.project,
        PATH: `${join(mock.project, "bin")}:${process.env.PATH ?? ""}`,
      },
      input: "DESTROY RECIPE FINDER DEMO RESOURCES\n",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Terraform destroy failed");
    expect(result.stderr).toContain("README.md");
    expect(readFileSync(join(mock.project, "infra/terraform.tfstate"), "utf8")).toBe("{}");
  });

  it("reports success only after state and AWS resource checks pass", () => {
    const mock = makeDemoProject(
      `
args="$*"
case "$args" in
  *" init") exit 0 ;;
  *" state list")
    count_file="$DEMO_TEST_ROOT/state-list-count"
    count=$(cat "$count_file" 2>/dev/null || printf '0')
    count=$((count + 1))
    printf '%s' "$count" > "$count_file"
    if [ "$count" = 1 ]; then cat <<'STATE_RESOURCES'
${stateResources}
STATE_RESOURCES
    fi
    ;;
  *" output -raw instance_id") printf 'i-demo\\n' ;;
  *" output -raw vpc_id") printf 'vpc-demo\\n' ;;
  *" output -raw security_group_id") printf 'sg-demo\\n' ;;
  *" output -raw elastic_ip_allocation_id") printf 'eipalloc-demo\\n' ;;
  *" output -raw key_name") printf 'demo-key\\n' ;;
  *" output -raw budget_name") printf 'demo-budget\\n' ;;
  *" destroy -auto-approve") exit 0 ;;
  *) exit 2 ;;
esac`,
      `
case "$*" in
  *"sts get-caller-identity"*) printf '123456789012\\n' ;;
  *"describe-instances"*) printf 'None\\n' ;;
  *"describe-security-groups"*) printf 'InvalidGroup.NotFound\\n' >&2; exit 255 ;;
  *"describe-addresses"*) printf 'InvalidAllocationID.NotFound\\n' >&2; exit 255 ;;
  *"describe-key-pairs"*) printf 'InvalidKeyPair.NotFound\\n' >&2; exit 255 ;;
  *"describe-vpcs"*) printf 'InvalidVpcID.NotFound\\n' >&2; exit 255 ;;
  *"describe-budgets"*) printf 'None\\n' ;;
  *) exit 2 ;;
esac`,
    );
    const result = spawnSync("bash", [mock.scriptPath], {
      cwd: mock.project,
      encoding: "utf8",
      env: {
        ...process.env,
        DEMO_ROOT_DIR: mock.project,
        DEMO_TEST_ROOT: mock.project,
        PATH: `${join(mock.project, "bin")}:${process.env.PATH ?? ""}`,
      },
      input: "DESTROY RECIPE FINDER DEMO RESOURCES\n",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("all stack-owned AWS resources are removed");
    expect(readFileSync(join(mock.project, "infra/terraform.tfstate"), "utf8")).toBe("{}");
  });
});
