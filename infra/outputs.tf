output "instance_id" {
  description = "EC2 instance identifier."
  value       = aws_instance.demo.id
}

output "vpc_id" {
  description = "Dedicated demo VPC identifier."
  value       = aws_vpc.demo.id
}

output "security_group_id" {
  description = "Demo security group identifier."
  value       = aws_security_group.demo.id
}

output "elastic_ip_allocation_id" {
  description = "Demo Elastic IP allocation identifier."
  value       = aws_eip.demo.id
}

output "key_name" {
  description = "Operator key-pair resource name."
  value       = aws_key_pair.operator.key_name
}

output "budget_name" {
  description = "Account-level monthly budget resource name."
  value       = aws_budgets_budget.demo.name
}

output "public_ip" {
  description = "Demo Elastic IP address."
  value       = aws_eip.demo.public_ip
}

output "public_hostname" {
  description = "IP-derived hostname for Caddy automatic HTTPS."
  value       = "${replace(aws_eip.demo.public_ip, ".", "-")}.sslip.io"
}

output "neo4j_password" {
  description = "Generated Neo4j password. Treat Terraform state as sensitive."
  value       = random_password.neo4j.result
  sensitive   = true
}
