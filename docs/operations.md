# CRICPSR operations

## Local Compose deployment

From the repository root, copy `.env.example` to `.env`, replace the local JWT/Grafana values, and create the MongoDB keyfile. In PowerShell:

```powershell
Copy-Item .env.example .env
$bytes = New-Object byte[] 384
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[System.IO.File]::WriteAllText((Join-Path $PWD 'mongo-keyfile'), [Convert]::ToBase64String($bytes))
docker compose up -d --build
```

The keyfile and `.env` are ignored by Git and excluded from container build contexts. The Compose backend connects to MongoDB at `mongodb:27017` with replica-set discovery; host-run processes continue to use the direct-host URI in `.env`. Only Nginx publishes the app port. MongoDB and Redis are bound to loopback for local administration; backend, exporter, and service ports are private to the Compose network.

Expected checks:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8080/api/health
```

The health endpoint should return `{"status":"ok","database":"connected"}`. `mongodb-init` exits with code 0 after creating the single-node replica set; that is expected. The app is at `http://localhost:8080`, Prometheus at `http://localhost:9090`, and Grafana at `http://localhost:3001` using `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`.

For code iteration using host Node processes, start only the infrastructure dependencies (`docker compose up -d mongodb mongodb-init redis`) and run `npm run dev`. The backend still uses `localhost:27018`; frontend and API are then on ports 3000 and 4000.

## Linux release deployment

Use the Ubuntu-only Ansible playbook in `provisioning/ansible/README.md` to install Docker Engine/Compose, clone the chosen Git ref, load the matching GHCR images, deploy Compose, and install a daily MongoDB backup timer. Keep production variables encrypted with Ansible Vault. Apply the Puppet host baseline separately and only after confirming key-based SSH access; see `provisioning/puppet/README.md`.

GitHub Actions runs lint, tests, builds, infrastructure validation, and image builds on pull requests and pushes to `main`. Publishing runs on `v*` tags and pushes backend, frontend, and MongoDB exporter images to GHCR. AWS release deployment is a manual workflow-dispatch job in the protected `production` environment and uses GitHub OIDC plus AWS Systems Manager; see `provisioning/aws/README.md` for the required environment variables and role trust setup. The Ansible bootstrap still needs a read-only GHCR token on the host.

The Compose Nginx container provides HTTP reverse proxying and Socket.IO WebSocket forwarding. Terminate HTTPS at a trusted load balancer or add a certificate-managed TLS listener before exposing a production host; set `APP_ORIGIN` to the public HTTPS origin. Monitoring ports are loopback-only by default and should be reached through an SSH tunnel or an authenticated private network.

## AWS EC2 deployment

`provisioning/aws` contains Terraform for a VPC, restricted EC2 security groups, an Ubuntu Compose host, an internet-facing ALB with ACM/Route 53 HTTPS, S3 backups, least-privilege instance IAM, GitHub OIDC-to-SSM deployment, and CloudWatch alarms. The stack intentionally uses one EC2 host for application and MongoDB; it is not a highly available database or a Kubernetes deployment. See [`provisioning/aws/README.md`](../provisioning/aws/README.md) for variable setup, apply/deploy commands, cost assumptions, SSM monitoring access, expected outputs, and S3 recovery steps. No AWS credentials or live deployment are included in the repository.

## Metrics and logs

The API emits one JSON log record per request with timestamp, method, normalized route, status, and duration. Startup and unhandled errors are JSON records on stdout/stderr. Docker retains bounded `json-file` logs (five 10 MB files per service); forward them to a protected log store for durable retention.

Prometheus scrapes `/metrics` on the backend plus MongoDB and Redis exporters. The MongoDB exporter uses the upstream 0.47.0 binary in a Debian runtime so its glibc dependency is present. Grafana provisions a Prometheus datasource and a service overview dashboard. Prometheus retains 15 days by default; change `PROMETHEUS_RETENTION` for available disk capacity. Metrics are internal to the Compose network; Grafana and Prometheus host ports bind to loopback.

## Backup and recovery

Backups use `mongodump --oplog` for a consistent replica-set snapshot, include MongoDB authentication metadata, are gzip-compressed and checksummed, and are retained locally for 14 days by default. Protect these files as secrets. The Ansible timer runs daily at approximately 02:15 host time:

```sh
sudo systemctl list-timers cricpsr-backup.timer
sudo systemctl start cricpsr-backup.service
sudo journalctl -u cricpsr-backup.service --no-pager
sha256sum -c /var/backups/cricpsr/cricpsr-<timestamp>.archive.gz.sha256
```

Before recovery, preserve a copy of the current data and stop writes. Restore requires an explicit destructive confirmation:

```sh
docker compose stop nginx backend
RESTORE_CONFIRM=RESTORE bash scripts/restore-mongodb.sh /var/backups/cricpsr/cricpsr-<timestamp>.archive.gz
docker compose up -d backend frontend nginx
curl --fail http://127.0.0.1/healthz
curl --fail http://127.0.0.1/api/health
```

The restore replays all databases and authentication metadata from that snapshot; use the matching protected MongoDB credentials and keyfile. It does not restore Prometheus/Grafana history or Docker volumes. Test restores on an isolated environment before relying on them. The generic/local deployment retains backups on-host; the Phase 9 AWS deployment additionally stores encrypted, versioned S3 copies, while off-account disaster recovery remains an operator responsibility.
