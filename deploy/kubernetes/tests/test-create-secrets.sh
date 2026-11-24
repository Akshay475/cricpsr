#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "${script_dir}/../../.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

mkdir -p "${temporary_dir}/bin"
printf 'test-only-mongo-keyfile\n' >"${temporary_dir}/mongo-keyfile"
export KUBECTL_LOG="${temporary_dir}/kubectl.log"
export KUBECTL_OUTPUT="${temporary_dir}/kubectl-output.yaml"

cat >"${temporary_dir}/bin/kubectl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$KUBECTL_LOG"

if [[ "$1" == "-n" && "$3" == "create" && "$4" == "secret" ]]; then
  for argument in "$@"; do
    case "$argument" in
      --from-env-file=*)
        env_file="${argument#*=}"
        ;;
      --from-file=mongo-keyfile=*)
        keyfile="${argument#--from-file=mongo-keyfile=}"
        ;;
    esac
  done
  [[ -f "$env_file" && -f "$keyfile" ]] || { echo "Secret input files are missing" >&2; exit 1; }
  [[ "$(stat -c '%a' "$env_file")" == "600" ]] || { echo "Temporary environment file is not mode 600" >&2; exit 1; }
  grep -q '^MONGO_INITDB_ROOT_USERNAME=cricpsr$' "$env_file" || { echo "Mongo username missing from generated env file" >&2; exit 1; }
  grep -q '^MONGODB_URI=mongodb://cricpsr:db-password-123@mongodb-0.mongodb-headless.cricpsr.svc.cluster.local:27017/cricpsr?authSource=admin&replicaSet=rs0$' "$env_file" || { echo "Mongo URI missing or incorrect" >&2; exit 1; }
  grep -q '^RAZORPAY_KEY_SECRET=$' "$env_file" || { echo "Empty optional payment key missing from generated env file" >&2; exit 1; }
  printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: cricpsr-secrets\n'
  exit 0
fi

if [[ "$1" == "apply" && "$2" == "-f" && "$3" == "-" ]]; then
  cat >"$KUBECTL_OUTPUT"
  grep -q 'name: cricpsr-secrets' "$KUBECTL_OUTPUT"
  echo "secret/cricpsr-secrets configured"
  exit 0
fi

echo "Unexpected kubectl call: $*" >&2
exit 2
MOCK
chmod +x "${temporary_dir}/bin/kubectl"

if ! PATH="${temporary_dir}/bin:${PATH}" \
  MONGO_KEYFILE_FILE="${temporary_dir}/mongo-keyfile" \
  MONGO_INITDB_ROOT_USERNAME=cricpsr \
  MONGO_INITDB_ROOT_PASSWORD=db-password-123 \
  REDIS_PASSWORD=redis-password-123 \
  JWT_ACCESS_SECRET=01234567890123456789012345678901 \
  RAZORPAY_KEY_ID= \
  RAZORPAY_KEY_SECRET= \
  RAZORPAY_WEBHOOK_SECRET= \
  bash "${project_dir}/deploy/kubernetes/scripts/create-secrets.sh" \
  >"${temporary_dir}/success.log" 2>&1; then
  cat "${temporary_dir}/success.log" >&2
  echo "Secret generation test failed" >&2
  exit 1
fi
if grep -q 'db-password-123\|redis-password-123\|01234567890123456789012345678901' "${temporary_dir}/success.log"; then
  echo "Secret generation printed credential values" >&2
  exit 1
fi
grep -q "create secret generic cricpsr-secrets" "$KUBECTL_LOG"
grep -q "apply -f -" "$KUBECTL_LOG"

previous_calls="$(wc -l <"$KUBECTL_LOG")"
if PATH="${temporary_dir}/bin:${PATH}" \
  MONGO_KEYFILE_FILE="${temporary_dir}/mongo-keyfile" \
  MONGO_INITDB_ROOT_USERNAME='invalid@user' \
  MONGO_INITDB_ROOT_PASSWORD=db-password-123 \
  REDIS_PASSWORD=redis-password-123 \
  JWT_ACCESS_SECRET=01234567890123456789012345678901 \
  RAZORPAY_KEY_ID= \
  RAZORPAY_KEY_SECRET= \
  RAZORPAY_WEBHOOK_SECRET= \
  bash "${project_dir}/deploy/kubernetes/scripts/create-secrets.sh" \
  >"${temporary_dir}/invalid.log" 2>&1; then
  echo "Unsafe MongoDB username unexpectedly succeeded" >&2
  exit 1
fi
if [[ "$(wc -l <"$KUBECTL_LOG")" -ne "$previous_calls" ]]; then
  echo "Invalid credentials reached kubectl" >&2
  exit 1
fi

echo "Kubernetes secret helper tests passed (temporary file, URI validation, and no secret output)."
