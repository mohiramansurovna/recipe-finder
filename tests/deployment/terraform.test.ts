import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const terraformDirectory = resolve(root, "infra");
const main = readFileSync(resolve(terraformDirectory, "main.tf"), "utf8");
const userData = readFileSync(
  resolve(terraformDirectory, "user-data.sh.tftpl"),
  "utf8",
);
const workflow = readFileSync(
  resolve(root, ".github/workflows/demo-deployment.yml"),
  "utf8",
);
const demoCompose = readFileSync(
  resolve(root, "docker-compose.demo.yml"),
  "utf8",
);

describe("demo infrastructure contracts", () => {
  it("allows only HTTPS ingress and the operator's SSH /32", () => {
    expect(main).toContain('from_port   = 80');
    expect(main).toContain('from_port   = 443');
    expect(main).toContain('from_port   = 22');
    expect(main).toContain('cidr_blocks = [var.ssh_allowed_cidr]');
    expect(main).not.toMatch(/from_port\s*=\s*(3000|7474|7473|7687)/);
    expect(demoCompose.split("  caddy:")[0]).not.toMatch(/^\s{4}ports:/m);
  });

  it("creates the budget before EC2 and does not put secrets in user data", () => {
    expect(main).toContain("aws_budgets_budget.demo");
    expect(main).toContain("aws_route_table_association.demo_public");
    expect(userData).not.toContain("NEO4J_PASSWORD");
    expect(userData).not.toContain("random_password");
  });

  it("creates a dedicated public subnet and routes it through its own internet gateway", () => {
    expect(main).toContain('resource "aws_vpc" "demo"');
    expect(main).toContain('resource "aws_subnet" "demo_public"');
    expect(main).toContain('resource "aws_internet_gateway" "demo"');
    expect(main).toContain('resource "aws_route_table_association" "demo_public"');
    expect(main).toContain("gateway_id = aws_internet_gateway.demo.id");
    expect(main).toContain("aws_route_table_association.demo_public");
    expect(main).not.toContain('data "aws_vpc" "default"');
  });

  it("limits image publication to GitHub package permissions without AWS credentials", () => {
    expect(workflow).toContain("packages: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toMatch(/configure-aws-credentials|AWS_ACCESS_KEY_ID|aws-actions/);
    expect(workflow).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
  });

  it("passes terraform formatting validation", () => {
    const result = spawnSync(
      "terraform",
      ["-chdir=infra", "fmt", "-check", "-recursive"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
