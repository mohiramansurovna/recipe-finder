variable "region" {
  description = "AWS region for the temporary demo."
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "The operator's current public IPv4 address as a /32."
  type        = string

  validation {
    condition     = can(cidrhost(var.ssh_allowed_cidr, 0)) && endswith(var.ssh_allowed_cidr, "/32")
    error_message = "ssh_allowed_cidr must be one IPv4 address with a /32 mask."
  }
}

variable "public_key_path" {
  description = "Path to the operator's SSH public key."
  type        = string
}

variable "budget_limit_usd" {
  description = "Account-level monthly budget alert amount in USD."
  type        = number
  default     = 5

  validation {
    condition     = var.budget_limit_usd > 0
    error_message = "budget_limit_usd must be greater than zero."
  }
}

variable "budget_notification_email" {
  description = "Email address that receives AWS budget notifications."
  type        = string

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.budget_notification_email))
    error_message = "budget_notification_email must be a valid email address."
  }
}

variable "name_prefix" {
  description = "Prefix used to identify resources owned by this demo stack."
  type        = string
  default     = "recipe-finder-demo"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.name_prefix))
    error_message = "name_prefix must be 3-25 lowercase letters, digits, or hyphens and start with a letter."
  }
}

variable "instance_type" {
  description = "EC2 instance type used for the demo."
  type        = string
  default     = "t3.medium"
}

variable "root_volume_size_gib" {
  description = "Encrypted gp3 root-volume size in GiB."
  type        = number
  default     = 30

  validation {
    condition     = var.root_volume_size_gib >= 20 && var.root_volume_size_gib <= 100
    error_message = "root_volume_size_gib must be between 20 and 100 GiB."
  }
}
