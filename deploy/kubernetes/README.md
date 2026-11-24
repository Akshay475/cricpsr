# Kubernetes deployment

These manifests deploy the existing CRICPSR containers with Kustomize. They do not create a cluster or change the Docker Compose/AWS deployment. The API remains the application boundary: batting, bowling, and fielding calculators are backend modules, not separate executables. Rating requests are routed to a separately scalable `ratings` Deployment running the same backend image; they are not independent microservices.

## Cluster prerequisites

- Kubernetes 1.26+ and `kubectl` with its built-in Kustomize support.
- A default `ReadWriteOnce` StorageClass able to provision at least a 20 GiB MongoDB volume and 5 GiB Redis volume. The manifests deliberately do not hardcode a cloud-specific storage class.
- `metrics-server` for the CPU-based HPAs.
- An ingress-nginx controller and a DNS name pointing to its external address.
- A TLS Secret named `cricpsr-tls` in namespace `cricpsr`, created by cert-manager or from an operator-managed certificate.
- Published GHCR images for the selected release tag. The packages must be public, or add an `imagePullSecrets` entry to each application pod template and create the corresponding pull Secret.

The MongoDB StatefulSet has one replica and uses a persistent volume plus an authenticated single-member replica set (`rs0`) because the application uses MongoDB transactions. This is persistent, not highly available. Redis is also a single authenticated StatefulSet; the current backend does not yet consume Redis. HPA scaling is configured only for frontend, backend, and rating API pods.

## Configure credentials and endpoint

From the repository root in Bash (Linux, macOS, WSL, or Git Bash), choose a stable namespace and generate the MongoDB keyfile once. Keep the keyfile outside Git and reuse the exact same file whenever updating the Kubernetes Secret:

```bash
export NAMESPACE=cricpsr
export MONGO_INITDB_ROOT_USERNAME=cricpsr
export MONGO_INITDB_ROOT_PASSWORD="$(openssl rand -hex 32)"
export REDIS_PASSWORD="$(openssl rand -hex 32)"
export JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
export RAZORPAY_KEY_ID=
export RAZORPAY_KEY_SECRET=
export RAZORPAY_WEBHOOK_SECRET=
mkdir -p "$HOME/.config/cricpsr"
export MONGO_KEYFILE_FILE="$HOME/.config/cricpsr/mongo-keyfile"
openssl rand -base64 756 > "$MONGO_KEYFILE_FILE"
chmod 600 "$MONGO_KEYFILE_FILE"

kubectl apply -f deploy/kubernetes/namespace.yaml
bash deploy/kubernetes/scripts/create-secrets.sh
```

The secret helper validates the database/Redis credentials, writes a temporary mode-600 environment file, and pipes the generated Secret directly to `kubectl apply`; it does not save credentials in the repository or print their values. MongoDB username/password and Redis password are restricted to URL-safe characters. Set all three Razorpay variables explicitly; use empty values to retain the app's mock-payment behavior. This avoids silently clearing existing payment credentials during a Secret update. Kubernetes Secrets are base64-encoded, not encrypted by default: enable encryption at rest and restrict etcd/RBAC access in the cluster.

Reuse the exact MongoDB keyfile and root credentials when updating this Secret. The MongoDB image only uses `MONGO_INITDB_ROOT_PASSWORD` when initializing an empty data directory; changing it in Kubernetes does not rotate the stored database user's password. Rotate MongoDB credentials through an authenticated database procedure first, then update the Secret and restart dependent pods. After changing JWT or payment secrets, explicitly restart the backend and ratings Deployments to load the new environment.

Before deploying, update both `FRONTEND_URL` in `deploy/kubernetes/configmap.yaml` and the hostname in `deploy/kubernetes/ingress.yaml` to the real HTTPS origin. Create the TLS Secret (unless cert-manager owns it):

```bash
kubectl -n cricpsr create secret tls cricpsr-tls \
  --cert=/secure/path/fullchain.pem \
  --key=/secure/path/privkey.pem
```

The published image names follow `.github/workflows/publish-images.yml`: `ghcr.io/akshay475/cricpsr/backend:<tag>` and `ghcr.io/akshay475/cricpsr/frontend:<tag>`. Push a `v*` Git tag and wait for the **Publish container images** workflow to finish. Then deploy that exact published tag:

```bash
bash deploy/kubernetes/scripts/deploy-release.sh v1.2.3
```

The script applies the Kustomize resources, initializes the single-member MongoDB replica set, waits for stateful and application rollouts, and persists the successful image tag in `kustomization.yaml`. On an upgrade failure it reapplies the previous manifest and image versions, then waits for their rollouts. On the first deployment there is no previous application revision to restore; fix the reported failure and rerun with a published tag.

Expected successful output ends with:

```text
CRICPSR release v1.2.3 is ready in namespace cricpsr.
```

## Verify and operate

```bash
kubectl -n cricpsr get pods,pvc,services,ingress,hpa
kubectl -n cricpsr get job mongodb-rs-init
kubectl -n cricpsr get hpa
curl --fail https://cricpsr.example.com/api/health
```

All pods should become `Running`/`Ready`, both PVCs should be `Bound`, the replica-set job should show `Complete`, and HPA metrics should populate once metrics-server has collected samples. The API health response should report `{"status":"ok","database":"connected"}`. Use the actual configured hostname in the URL.

For private GHCR packages, create a namespace-scoped read-only package pull Secret using an operator-managed `read:packages` token:

```bash
read -r -p "GHCR username: " GHCR_USERNAME
read -r -s -p "GHCR read:packages token: " GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin
unset GHCR_TOKEN
kubectl -n cricpsr create secret generic ghcr-pull \
  --type=kubernetes.io/dockerconfigjson \
  --from-file=.dockerconfigjson="$HOME/.docker/config.json" \
  --dry-run=client -o yaml | kubectl apply -f -
docker logout ghcr.io
```

Add `imagePullSecrets: [{name: ghcr-pull}]` under each application Deployment's `spec.template.spec` before deploying. Do not put the token in a manifest or command history; restrict access to the generated Secret.

The release script automatically reverts the manifests and images it touched when an apply or rollout fails. Manual recovery is also available:

```bash
kubectl -n cricpsr rollout undo deployment/backend
kubectl -n cricpsr rollout undo deployment/ratings
kubectl -n cricpsr rollout undo deployment/frontend
kubectl -n cricpsr rollout undo deployment/nginx
kubectl -n cricpsr rollout status deployment/backend --timeout=10m
```

The MongoDB and Redis PVCs survive pod replacement, but this phase does not install a database operator, replica-set failover, scheduled Kubernetes backup, S3 backup job, or tested volume-snapshot policy. Configure and test cluster-native snapshots/backup before storing production data. If MongoDB storage is deliberately recreated empty, delete the completed `mongodb-rs-init` Job and rerun the release script so it can initialize a fresh replica set.

## Offline validation

```bash
kubectl kustomize deploy/kubernetes
bash -n deploy/kubernetes/scripts/create-secrets.sh
bash -n deploy/kubernetes/scripts/deploy-release.sh
bash deploy/kubernetes/tests/test-create-secrets.sh
bash deploy/kubernetes/tests/test-deploy-release.sh
```

These checks render and test the manifests locally; they do not prove a cluster can provision storage, pull images, issue a certificate, or schedule the workloads.
