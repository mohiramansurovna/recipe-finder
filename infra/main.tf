resource "aws_vpc" "demo" {
  cidr_block           = "10.77.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name    = "${var.name_prefix}-vpc"
    Project = "recipe-finder-demo"
  }
}

resource "aws_subnet" "demo_public" {
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = "10.77.1.0/24"
  map_public_ip_on_launch = true

  tags = {
    Name    = "${var.name_prefix}-public"
    Project = "recipe-finder-demo"
  }
}

resource "aws_internet_gateway" "demo" {
  vpc_id = aws_vpc.demo.id

  tags = {
    Name    = "${var.name_prefix}-igw"
    Project = "recipe-finder-demo"
  }
}

resource "aws_route_table" "demo_public" {
  vpc_id = aws_vpc.demo.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo.id
  }

  tags = {
    Name    = "${var.name_prefix}-public"
    Project = "recipe-finder-demo"
  }
}

resource "aws_route_table_association" "demo_public" {
  subnet_id      = aws_subnet.demo_public.id
  route_table_id = aws_route_table.demo_public.id
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "random_password" "neo4j" {
  length  = 32
  special = false
}

resource "aws_key_pair" "operator" {
  key_name   = "${var.name_prefix}-operator"
  public_key = file(var.public_key_path)

  tags = {
    Name    = "${var.name_prefix}-operator"
    Project = "recipe-finder-demo"
  }
}

resource "aws_security_group" "demo" {
  name        = "${var.name_prefix}-web"
  description = "Temporary Recipe Finder demo ingress"
  vpc_id      = aws_vpc.demo.id

  ingress {
    description = "HTTP redirect and ACME validation"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS demo"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Operator SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  egress {
    description = "Outbound updates, image pulls, and certificate validation"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.name_prefix}-web"
    Project = "recipe-finder-demo"
  }
}

resource "aws_budgets_budget" "demo" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_notification_email]
  }
}

resource "aws_instance" "demo" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.demo_public.id
  vpc_security_group_ids      = [aws_security_group.demo.id]
  key_name                    = aws_key_pair.operator.key_name
  associate_public_ip_address = true
  user_data                   = file("${path.module}/user-data.sh.tftpl")
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gib
    encrypted             = true
    delete_on_termination = true
  }

  tags = {
    Name    = var.name_prefix
    Project = "recipe-finder-demo"
  }

  depends_on = [
    aws_budgets_budget.demo,
    aws_route_table_association.demo_public,
  ]
}

resource "aws_eip" "demo" {
  domain = "vpc"

  tags = {
    Name    = var.name_prefix
    Project = "recipe-finder-demo"
  }
}

resource "aws_eip_association" "demo" {
  allocation_id = aws_eip.demo.id
  instance_id   = aws_instance.demo.id
}
