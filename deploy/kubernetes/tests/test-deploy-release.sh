#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "${script_dir}/../../.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

mkdir -p "${temporary_dir}/bin"
cp -R "${project_dir}/deploy/kubernetes" "${temporary_dir}/kubernetes"
export KUBECTL_LOG="${temporary_dir}/kubectl.log"

cat >"${temporary_dir}/bin/kubectl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"$KUBECTL_LOG"
if [[ "$1" == "config" || "$1" == "cluster-info" ]]; then
  exit 0
fi
if [[ "$1" == "apply" ]]; then
  exit 0
fi
if [[ "$1" == "-n" && "$3" == "get" && "$4" == "secret" ]]; then
  exit 0
fi
if [[ "$1" == "-n" && "$3" == "get" && "$4" == "deployment" ]]; then
  component="$5"
  if [[ "$component" == "ratings" ]]; then
    component=backend
  fi
  echo "ghcr.io/akshay475/cricpsr/${component}:v0.9.0"
  exit 0
fi
if [[ "$1" == "-n" && "$3" == "wait" ]]; then
  exit 0
fi
if [[ "$1" == "-n" && "$3" == "rollout" && "$4" == "status" ]]; then
  if [[ "${KUBECTL_FAIL_ONCE:-}" == "$5" && ! -e "${KUBECTL_FAIL_MARKER:-}" ]]; then
    touch "$KUBECTL_FAIL_MARKER"
    exit 1
  fi
  exit 0
fi
if [[ "$1" == "-n" && "$3" == "set" && "$4" == "image" ]]; then
  exit 0
fi
echo "Unexpected kubectl call: $*" >&2
exit 2
MOCK
chmod +x "${temporary_dir}/bin/kubectl"

manifest="${temporary_dir}/kubernetes/kustomization.yaml"
run_deploy() {
  PATH="${temporary_dir}/bin:${PATH}" NAMESPACE=cricpsr \
    bash "${temporary_dir}/kubernetes/scripts/deploy-release.sh" "$@"
}

if run_deploy "invalid;tag" >/dev/null 2>&1; then
  echo "Invalid release tag unexpectedly succeeded" >&2
  exit 1
fi

if ! run_deploy "v1.2.3" >"${temporary_dir}/success.log" 2>&1; then
  cat "${temporary_dir}/success.log" >&2
  echo "Successful release deployment test failed" >&2
  exit 1
fi
if [[ "$(grep -c 'newTag: v1.2.3' "$manifest")" -ne 2 ]]; then
  echo "Successful release did not persist both image tags" >&2
  exit 1
fi
grep -q "CRICPSR release v1.2.3 is ready" "${temporary_dir}/success.log"

cp -R "${project_dir}/deploy/kubernetes" "${temporary_dir}/rollback-kubernetes"
rollback_manifest="${temporary_dir}/rollback-kubernetes/kustomization.yaml"
export KUBECTL_FAIL_ONCE="deployment/ratings"
export KUBECTL_FAIL_MARKER="${temporary_dir}/failed-once"
if PATH="${temporary_dir}/bin:${PATH}" NAMESPACE=cricpsr \
  bash "${temporary_dir}/rollback-kubernetes/scripts/deploy-release.sh" "v1.2.4" \
  >"${temporary_dir}/rollback.log" 2>&1; then
  cat "${temporary_dir}/rollback.log" >&2
  echo "Failed rollout unexpectedly succeeded" >&2
  exit 1
fi
if [[ "$(grep -c 'newTag: REPLACE_WITH_RELEASE_TAG' "$rollback_manifest")" -ne 2 ]]; then
  echo "Failed release did not restore the manifest image tags" >&2
  exit 1
fi
grep -q "restoring the previous Kubernetes manifests and images" "${temporary_dir}/rollback.log"
grep -q -- "-n cricpsr set image deployment/ratings ratings=ghcr.io/akshay475/cricpsr/backend:v0.9.0" "$KUBECTL_LOG" || {
  echo "Rollback did not restore the previous ratings image" >&2
  exit 1
}
echo "Kubernetes release helper tests passed (invalid tag, successful rollout, and rollback)."
