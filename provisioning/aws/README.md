# AWS single-host deployment

The Terraform stack is reviewable infrastructure-as-code; it does not deploy until an operator supplies AWS credentials and applies a reviewed plan. It creates:

- A VPC with two public subnets for an internet-facing Application Load Balancer.
- An Ubuntu 24.04 EC2 application host with an encrypted gp3 root volume, IMDSv2, an Elastic IP, and an instance profile.
- Security groups exposing only ALB ports 80/443 publicly, Nginx port 8080 to the ALB, and SSH to the configured operator CIDR.
- An ACM certificate validated through an existing Route 53 hosted zone. The ALB redirects HTTP to HTTPS and serves the application over TLS.
- A private, versioned, AES-256-encrypted S3 bucket for MongoDB backups with a configurable lifecycle.
- Instance IAM permissions limited to Systems Manager and the backup bucket prefix; a GitHub OIDC deploy role limited to the configured repository/environment and SSM command execution on this EC2 instance.
- CloudWatch alarms for sustained EC2 CPU and unhealthy ALB targets.

MongoDB, Redis, the API, frontend, Nginx, and monitoring remain in Docker Compose on one EC2 instance. The ALB and DNS/TLS are multi-AZ, but the application and database host are not highly available. The encrypted root EBS volume is retained on instance termination; use S3 logical backups for recovery rather than assuming an instance replacement will reattach its old root volume. No Kubernetes, RDS migration, NAT gateway, or live AWS resources are included.

CloudWatch alarms are visible in the account but have no SNS/email action configured; add an operator-owned notification target before relying on them for paging.

## Cost and prerequisites

The defaults assume `us-east-1`, one `t3.large` (2 vCPU/8 GiB), an 80 GiB gp3 root disk, an internet-facing ALB across two AZs, one Elastic IP, one existing Route 53 hosted zone, and 90-day S3 backup retention. A rough base estimate is **about $95–$140 USD/month**, before taxes, traffic, S3 storage/requests, data transfer, CloudWatch charges, and ALB capacity units. Prices vary by region and change; check the AWS Pricing Calculator before applying. The `t3.large` default is chosen for the existing Compose stack, not as a performance guarantee.

You need an AWS account, Terraform 1.8+, AWS CLI credentials (prefer `aws sso login`/`AWS_PROFILE`), an existing EC2 key pair, an existing Route 53 hosted zone authoritative for the application domain, and a globally unique S3 bucket name. The account must permit the listed VPC, EC2, ALB, ACM, Route 53, IAM/OIDC, S3, SSM, and CloudWatch resources. Do not put credentials, private keys, or production `.tfvars` in Git.

## Create and review the infrastructure

From this directory, copy the example and replace the example domain, zone, key pair, fixed operator CIDR, and unique bucket name:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
aws sso login --profile cricpsr-production
$env:AWS_PROFILE = "cricpsr-production"
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

`terraform init`, formatting, and validation do not create infrastructure. `plan` queries AWS and shows the proposed resources. Only `apply` creates them and incurs charges. Review the plan before applying. The configuration manages the GitHub Actions OIDC provider; if the AWS account already has `token.actions.githubusercontent.com`, import it into this state before applying:

```powershell
$accountId = aws sts get-caller-identity --query Account --output text
terraform import aws_iam_openid_connect_provider.github "arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com"
```

Terraform's default local state is ignored by Git but is not a team-safe backend. Before production or shared use, configure an encrypted, versioned remote S3 state bucket and locking. The application backup bucket is not configured as the Terraform backend.

Useful outputs:

```powershell
terraform output -raw app_url
terraform output -raw aws_region
terraform output -raw instance_public_ip
terraform output -raw instance_id
terraform output -raw backup_s3_uri
terraform output -raw github_deploy_role_arn
```

The plan creates a DNS alias and ACM validation record. The hosted zone must already be delegated at the domain registrar; certificate validation and DNS propagation must complete before HTTPS health checks succeed.

## Provision and deploy the application

1. Copy `terraform output -raw instance_public_ip` into `provisioning/ansible/inventory/production.ini` and use the key pair named by `ssh_key_name`. Keep the Terraform `ssh_allowed_cidr` limited to a fixed operator address.
2. Set `app_origin` to `https://<app_domain>`, `aws_region` and `backup_s3_uri` to Terraform outputs, and populate the remaining production values in `provisioning/ansible/group_vars/production.yml`. Encrypt that file with Ansible Vault.
3. Run `ansible-playbook -i inventory/production.ini site.yml --ask-vault-pass` from `provisioning/ansible`. The playbook installs Docker/AWS CLI, configures the application host, enables its SSM agent, pulls the selected release, and schedules S3-backed backups.
4. In the protected GitHub `production` environment, set variables `AWS_REGION`, `AWS_ROLE_ARN` (the `github_deploy_role_arn` output), `AWS_INSTANCE_ID`, and optionally `DEPLOY_PATH` (default `/opt/cricpsr`). The workflow role trust only permits this repository and environment. Publish a `v*` image tag, then run **Deploy CRICPSR** with that tag.

The GitHub deployment uses OIDC and SSM; it does not need stored AWS access keys or an inbound SSH rule for GitHub-hosted runners. The Ansible bootstrap still uses restricted SSH from the operator CIDR.

Expected checks after deployment:

```powershell
$appDomain = "cricket.example.com"
Invoke-RestMethod "https://${appDomain}/api/health"
curl.exe -I "http://${appDomain}"
```

The API health response should report `status: ok` and `database: connected`; HTTP should redirect to HTTPS. The ALB target health path is `/api/health`, so a database or API outage makes the target unhealthy. `terraform output -raw app_url` prints the HTTPS URL. If the certificate remains pending, check Route 53 delegation and the ACM validation record. If the ALB has no healthy targets, inspect EC2/SSM status, `docker compose ps`, host port 8080, and the instance security-group source rule.

Prometheus and Grafana remain bound to EC2 loopback. Use Systems Manager port forwarding rather than opening their ports publicly:

```powershell
aws ssm start-session --target (terraform output -raw instance_id) --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["3001"],"localPortNumber":["3001"]}'
```

Use port `9090` to forward Prometheus instead.

## MongoDB backup and recovery

The daily systemd backup stores a compressed, checksummed replica-set dump locally and uploads the archive and checksum to the Terraform S3 prefix using the EC2 instance profile. S3 blocks public access, uses AES-256 server-side encryption, enables versioning, and expires objects after `backup_retention_days` (90 days by default). No AWS access key is written to the instance. Check uploads with:

```sh
BACKUP_BUCKET="replace-with-terraform-bucket-name"
aws s3 ls "s3://${BACKUP_BUCKET}/cricpsr/"
sudo journalctl -u cricpsr-backup.service --no-pager
```

Stop application writes and confirm the exact restore target before running the guarded, checksum-verifying S3 restore on the host:

```sh
sudo -u cricpsr -H bash -lc 'cd /opt/cricpsr && docker compose stop nginx frontend backend'
BACKUP_URI="s3://replace-with-bucket-name/cricpsr/cricpsr-YYYYMMDDTHHMMSSZ.archive.gz"
sudo -u cricpsr -H bash -lc "cd /opt/cricpsr && RESTORE_CONFIRM=RESTORE bash scripts/restore-mongodb-s3.sh '${BACKUP_URI}'"
sudo -u cricpsr -H bash -lc 'cd /opt/cricpsr && docker compose up -d backend frontend nginx'
curl --fail http://127.0.0.1:8080/api/health
```

The command replaces MongoDB data; test recovery in an isolated environment first. S3 versioning and lifecycle are not a substitute for off-account disaster recovery. Copy critical backups to a separately controlled account if that threat model is required.
