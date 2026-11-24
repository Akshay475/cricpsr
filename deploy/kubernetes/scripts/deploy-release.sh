#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:-}"
namespace="${NAMESPACE:-cricpsr}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
manifest_dir="$(cd -- "${script_dir}/.." && pwd)"
kustomization="${manifest_dir}/kustomization.yaml"

if ! [[ "$release_tag" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "Usage: deploy-release.sh <published-image-tag>" >&2
  exit 2
fi

if [[ "$(grep -c '^[[:space:]]*newTag:' "$kustomization")" -ne 2 ]]; then
  echo "Expected exactly two image tags in ${kustomization}" >&2
  exit 2
fi

kubectl config current-context >/dev/null
kubectl cluster-info >/dev/null
kubectl apply -f "${manifest_dir}/namespace.yaml" >/dev/null
kubectl -n "$namespace" get secret cricpsr-secrets >/dev/null

deployments=(backend ratings frontend nginx)
containers=(backend ratings frontend nginx)
old_images=()
for index in "${!deployments[@]}"; do
  deployment="${deployments[$index]}"
  container="${containers[$index]}"
  if kubectl -n "$namespace" get deployment "$deployment" >/dev/null 2>&1; then
    old_images[$index]="$(kubectl -n "$namespace" get deployment "$deployment" \
      -o "jsonpath={.spec.template.spec.containers[?(@.name==\"${container}\")].image}")"
  else
    old_images[$index]=""
  fi
done

backup="$(mktemp)"
temporary="$(mktemp "${kustomization}.XXXXXX")"
cp "$kustomization" "$backup"
trap 'rm -f "$backup" "$temporary"' EXIT

rollback() {
  local reason="$1"
  echo "Deployment failed (${reason}); restoring the previous Kubernetes manifests and images." >&2
  cp "$backup" "$kustomization"
  if ! kubectl apply -k "$manifest_dir"; then
    echo "Rollback manifest apply failed; inspect the cluster and run kubectl rollout undo." >&2
    return 1
  fi

  local restored_previous=0
  for index in "${!deployments[@]}"; do
    deployment="${deployments[$index]}"
    container="${containers[$index]}"
    if [[ -n "${old_images[$index]}" ]]; then
      restored_previous=1
      if ! kubectl -n "$namespace" set image "deployment/${deployment}" "${container}=${old_images[$index]}"; then
        echo "Failed to restore ${deployment} image ${old_images[$index]}" >&2
        return 1
      fi
      if ! kubectl -n "$namespace" rollout status "deployment/${deployment}" --timeout=5m; then
        echo "Rollback rollout failed for ${deployment}" >&2
        return 1
      fi
    fi
  done
  if [[ "$restored_previous" -eq 0 ]]; then
    echo "No previous application revision existed; fix the reported issue and deploy a valid release tag." >&2
  fi
}

sed -E "s/^([[:space:]]*newTag:).*/\\1 ${release_tag}/" "$kustomization" >"$temporary"
mv "$temporary" "$kustomization"

if ! kubectl apply -k "$manifest_dir"; then
  rollback "manifest apply"
  exit 1
fi

if ! kubectl -n "$namespace" wait --for=condition=complete job/mongodb-rs-init --timeout=15m; then
  rollback "MongoDB replica-set initialization"
  exit 1
fi

if ! kubectl -n "$namespace" rollout status statefulset/mongodb --timeout=5m; then
  rollback "MongoDB StatefulSet rollout"
  exit 1
fi
if ! kubectl -n "$namespace" rollout status statefulset/redis --timeout=5m; then
  rollback "Redis StatefulSet rollout"
  exit 1
fi

for deployment in "${deployments[@]}"; do
  if ! kubectl -n "$namespace" rollout status "deployment/${deployment}" --timeout=10m; then
    rollback "${deployment} rollout"
    exit 1
  fi
done

echo "CRICPSR release ${release_tag} is ready in namespace ${namespace}."
