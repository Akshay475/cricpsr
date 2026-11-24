# Ansible provisioning

The playbook supports Ubuntu LTS and owns Docker installation, the CRICPSR deployment user, release checkout, GHCR login, Compose deployment, and the scheduled S3 backup timer. On AWS, it expects the EC2 instance profile created by `provisioning/aws` to provide S3 and Systems Manager access; it does not install or store AWS access keys. It deliberately does not manage SSH policy or time synchronization; those are Puppet-owned.

1. Copy `inventory/production.ini.example` to `inventory/production.ini`, set its target to Terraform's `instance_public_ip` output, and configure the operator SSH key matching `ssh_key_name`.
2. Copy `group_vars/production.yml.example` to `group_vars/production.yml`. Set the read-only GitHub deploy key, a verified GitHub `known_hosts` line, a GHCR token with `read:packages`, release tag, HTTPS origin, Terraform `backup_s3_uri` and `aws_region`, and unique secrets.
3. Generate an alphanumeric MongoDB keyfile value, for example `python3 -c 'import secrets; print(secrets.token_hex(384))'`, and put it in `mongo_keyfile_content`.
4. Encrypt the production variables file with Ansible Vault: `ansible-vault encrypt group_vars/production.yml`. Keep the Vault password outside the repository.
5. Run `ansible-playbook -i inventory/production.ini site.yml --ask-vault-pass`.

The deployment user belongs to the Docker group, which is effectively root access. The playbook writes `.env` with mode `0600`, the Mongo keyfile with mode `0400`, and suppresses task output containing secrets. Use unique, URL-safe MongoDB and Redis credentials; this avoids URI-escaping mistakes.

The GitHub Actions release workflow uses OIDC and SSM rather than inbound SSH. Set the protected `production` environment variables `AWS_REGION`, `AWS_ROLE_ARN` (Terraform's `github_deploy_role_arn`), `AWS_INSTANCE_ID`, and optionally `DEPLOY_PATH` (defaults to `/opt/cricpsr`). The role trust is scoped to the configured repository and GitHub environment.
