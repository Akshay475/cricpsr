variable "aws_region" {
  description = "AWS region for the production stack."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project label used for resource names and tags."
  type        = string
  default     = "cricpsr"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "IPv4 range for the application VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Two public subnet CIDRs in distinct Availability Zones for the ALB."
  type        = list(string)
  default     = ["10.42.1.0/24", "10.42.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 2 && alltrue([for cidr in var.public_subnet_cidrs : can(cidrnetmask(cidr))])
    error_message = "Provide exactly two valid IPv4 subnet CIDRs."
  }
}

variable "app_domain" {
  description = "Fully qualified hostname for the application, such as cricket.example.com."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$", var.app_domain))
    error_message = "app_domain must be a fully qualified DNS name."
  }
}

variable "route53_zone_id" {
  description = "ID of an existing Route 53 hosted zone authoritative for app_domain."
  type        = string
}

variable "ssh_key_name" {
  description = "Name of an existing EC2 key pair used only for restricted Ansible bootstrap access."
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "Trusted operator IPv4 CIDR permitted to SSH to the instance; use a fixed /32 where possible."
  type        = string

  validation {
    condition     = can(cidrnetmask(var.ssh_allowed_cidr))
    error_message = "ssh_allowed_cidr must be a valid IPv4 CIDR."
  }
}

variable "instance_type" {
  description = "EC2 instance type for the single-host Compose deployment."
  type        = string
  default     = "t3.large"
}

variable "root_volume_size_gb" {
  description = "Encrypted gp3 root volume size; MongoDB and other Compose data reside on this volume."
  type        = number
  default     = 80

  validation {
    condition     = var.root_volume_size_gb >= 40
    error_message = "root_volume_size_gb must be at least 40 GiB."
  }
}

variable "backup_bucket_name" {
  description = "Globally unique S3 bucket name for encrypted MongoDB backups."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.backup_bucket_name))
    error_message = "backup_bucket_name must be 3-63 lowercase letters, digits, or hyphens and start/end with a letter or digit."
  }
}

variable "backup_retention_days" {
  description = "S3 retention in days for current and replaced backup objects."
  type        = number
  default     = 90

  validation {
    condition     = var.backup_retention_days >= 30 && var.backup_retention_days <= 3650
    error_message = "backup_retention_days must be between 30 and 3650."
  }
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to assume the deploy role through OIDC."
  type        = string
  default     = "Akshay475/cricpsr"
}

variable "github_environment" {
  description = "Protected GitHub Actions environment required by the deploy role trust policy."
  type        = string
  default     = "production"
}
