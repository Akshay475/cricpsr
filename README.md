# cricpsr
CRICPSR is an AI-powered cricket platform for player evaluation, talent discovery, tournaments, independent batting, bowling and fielding ratings, auctions, and performance analytics.

## Phase 1 — Foundation

Phase 1 includes the Next.js frontend, Express/TypeScript backend, MongoDB connection, JWT authentication, player registration, landing page, environment template, and local Docker services.

### Prerequisites

- Node.js 22+
- Docker Desktop
- MongoDB and Redis are provided by Docker Compose

### Local setup

Copy the example file, replace the JWT and Grafana placeholders with random local values as described in [`docs/operations.md`](docs/operations.md), and create the MongoDB keyfile before starting services.

```powershell
npm install
Copy-Item .env.example .env
$bytes = New-Object byte[] 384
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[System.IO.File]::WriteAllText((Join-Path $PWD 'mongo-keyfile'), [Convert]::ToBase64String($bytes))
docker compose up -d mongodb mongodb-init redis
npm run dev
```

Open <http://localhost:3000>. The API is available at <http://localhost:4000/api>.
Host-run backend processes use `localhost:27018` with `directConnection=true`; this keeps MongoDB transactions available without redirecting the driver to Docker-only DNS. The Compose backend overrides `MONGODB_URI` to use `mongodb:27017` with replica-set discovery. Start `mongodb-init` as shown above to initialize the single-node replica set required for transactions.

### Run checks

```powershell
npm run lint
npm test
npm run build
```

## Phase 2

Phase 2 adds:

- Player profile and hierarchical state/district/zone selection
- Player profile and independent batting/bowling/fielding card dashboard
- Monthly, six-month, and annual subscription plans
- Razorpay test-mode order creation and server-side verification placeholders
- Development/test mock checkout when Razorpay credentials are absent

Razorpay environment variables:

```text
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Checkout requires `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; captured-payment webhooks also require `RAZORPAY_WEBHOOK_SECRET`. In development/test, when checkout credentials are absent, `/api/subscriptions/checkout` returns `mode: "mock"` and does not activate a subscription.
Mock checkout is disabled in production; subscription and marketplace checkout return `503` until both Razorpay keys are configured, and production rejects mock payment verification.

## Phase 3

Phase 3 adds:

- Team creation and roster membership
- Tournament creation, registration, approval, status, fixture, and discovery APIs
- Match scheduling and status management
- Ball-by-ball event records
- Player batting, bowling, and fielding match statistics
- Match scorecards and verification by authorized administrators

Key API prefixes:

```text
/api/teams
/api/tournaments
/api/matches
```

## Phase 4

Phase 4 adds three separate deterministic rating engines:

- Batting: runs, balls, outs, boundaries, innings, and verified match sufficiency
- Bowling: overs, balls, runs conceded, wickets, maidens, economy, average, and strike rate
- Fielding: opportunities, catches, run-outs, stumpings, successful actions, missed catches, and verification sufficiency

Rating APIs, histories, explanations, role-aware dashboard emphasis, and independent batting/bowling/fielding leaderboards are available at:

```text
/api/players/:playerId/ratings
/api/players/:playerId/ratings/history
/api/rankings/batting
/api/rankings/bowling
/api/rankings/fielding
```

## Phase 5

Phase 5 adds:

- Zone-validated 1v1 challenges with 1-over, 3-over, and 5-over formats
- Challenge accept/reject/completion/administrator verification lifecycle
- Turf profile, address/coordinates, verification, and time-slot management
- Open-match discovery and zone validation
- Duplicate-safe registration and player limits
- Random balanced teams using role and independent rating weights
- `/find-match` frontend flow

Key API prefixes:

```text
/api/challenges
/api/turfs
/api/open-matches
```

## Phase 6

Phase 6 adds:

- District, state, and national auction events
- Auction team budgets and squad limits
- Approved player lots and sold/unsold selection
- Independent batting, bowling, and fielding minimum/filter/sort search
- Idempotency-keyed server-side bids
- MongoDB transaction commits for bids and sold-player budget updates
- Socket.IO auction bid and selection rooms

Key API prefix:

```text
/api/auctions
```

API health:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

## Phase 7 — Marketplace

The marketplace supports pending brand registration and super-admin review, approved-brand product listings, seller inventory and order fulfilment, buyer carts and orders, Razorpay checkout/signature verification, and development/test mock checkout when Razorpay keys are unset. Checkout reserves stock transactionally; cancelling an unpaid order releases that stock.

Key API routes:

```text
/api/marketplace/brands
/api/marketplace/products
/api/marketplace/seller/dashboard
/api/marketplace/cart
/api/marketplace/checkout
/api/marketplace/orders
```

Use the Phase 2 `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` settings for real checkout and captured-payment webhooks at `/api/webhooks/razorpay`. Without credentials, checkout is explicitly marked `mock`; it does not represent a live charge. New brands remain hidden until an authenticated `superAdmin` reviews them through `PATCH /api/marketplace/brands/:brandId/review`. Live provider credentials and an administrator account must be configured separately.

For local development only, create the intended admin user, then promote it in the local MongoDB and sign in again to refresh the role in its token:

```powershell
docker compose exec mongodb mongosh -u cricpsr -p cricpsr-dev --authenticationDatabase admin --eval 'db.getSiblingDB("cricpsr").users.updateOne({email:"admin@example.com"},{$addToSet:{roles:"superAdmin"}})'
```

Do not use this development-only command as production role provisioning.

## Phase 8 — Operations and deployment

Phase 8 adds hardened multi-stage containers, Compose deployment through Nginx, Prometheus/Grafana with a provisioned service dashboard, structured JSON API logs, Ubuntu Ansible provisioning, a separate Puppet host baseline, GitHub Actions CI/image publishing/manual deployment, and guarded MongoDB backup/restore scripts with a daily systemd timer.

See [`docs/operations.md`](docs/operations.md) for exact local and production commands, expected health output, GitHub OIDC deployment setup, monitoring access, and recovery procedures. Ansible and Puppet boundaries and setup are documented in their respective `provisioning` directories.

## Phase 9 — AWS deployment

`provisioning/aws` adds reviewable Terraform for a single-host EC2 Compose deployment behind an ALB with ACM HTTPS and Route 53 DNS, restricted security groups, IAM instance and GitHub OIDC deploy roles, private versioned S3 backups, and CloudWatch alarms. Ansible provisions the Ubuntu host; GitHub Actions deploys published releases through SSM. The application/database host is intentionally single-instance and is not highly available. No AWS credentials or live deployment are included.

See [`provisioning/aws/README.md`](provisioning/aws/README.md) for cost assumptions, prerequisites, exact Terraform/Ansible commands, monitoring access, health checks, and recovery.

## Phase 10 — Kubernetes

`deploy/kubernetes` adds Kustomize manifests for frontend, backend, separately routed/scaled rating API, Nginx/Ingress, MongoDB replica-set storage, Redis, Secrets, probes, and HPAs, with a guarded release/rollback helper. Rating engines remain modules within the backend image rather than separate microservices. The Kubernetes deployment is separate from Compose and the AWS single-host stack; no cluster was provisioned.

See [`deploy/kubernetes/README.md`](deploy/kubernetes/README.md) for prerequisites, secret creation, release, verification, rollback, persistence caveats, and local validation commands.
