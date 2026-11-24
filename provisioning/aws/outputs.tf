output "app_url" {
  description = "HTTPS URL served through the ALB and ACM certificate."
  value       = "https://${var.app_domain}"
}

output "alb_dns_name" {
  description = "AWS ALB hostname backing the Route 53 alias."
  value       = aws_lb.app.dns_name
}

output "instance_id" {
  description = "EC2 instance ID for AWS Systems Manager and Ansible."
  value       = aws_instance.app.id
}

output "instance_public_ip" {
  description = "Elastic IP for restricted SSH bootstrap access."
  value       = aws_eip.app.public_ip
}

output "backup_s3_uri" {
  description = "S3 prefix for MongoDB backup archives."
  value       = "s3://${aws_s3_bucket.backups.bucket}/cricpsr"
}

output "aws_region" {
  description = "Region used by the GitHub Actions deployment workflow."
  value       = var.aws_region
}

output "github_deploy_role_arn" {
  description = "OIDC role ARN to configure as the production GitHub Actions variable AWS_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
}
