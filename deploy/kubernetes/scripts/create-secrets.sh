#!/usr/bin/env bash
set -euo pipefail
umask 077

namespace="${NAMESPACE:-cricpsr}"
keyfile="${MONGO_KEYFILE_FILE:-}"

if ! [[ "$namespace" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || [[ "${#namespace}" -gt 63 ]]; then
  echo "NAMESPACE must be a valid lowercase Kubernetes namespace" >&2
  exit 2
fi

: "${MONGO_INITDB_ROOT_USERNAME:?Set MONGO_INITDB_ROOT_USERNAME}"
: "${MONGO_INITDB_ROOT_PASSWORD:?Set MONGO_INITDB_ROOT_PASSWORD}"
: "${JWT_ACCESS_SECRET:?Set JWT_ACCESS_SECRET}"
: "${REDIS_PASSWORD:?Set REDIS_PASSWORD}"
: "${keyfile:?Set MONGO_KEYFILE_FILE to the persistent MongoDB keyfile path}"

: "${RAZORPAY_KEY_ID?Set RAZORPAY_KEY_ID explicitly (empty is allowed)}"
: "${RAZORPAY_KEY_SECRET?Set RAZORPAY_KEY_SECRET explicitly (empty is allowed)}"
: "${RAZORPAY_WEBHOOK_SECRET?Set RAZORPAY_WEBHOOK_SECRET explicitly (empty is allowed)}"

if ! [[ "$MONGO_INITDB_ROOT_USERNAME" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "MONGO_INITDB_ROOT_USERNAME may contain only letters, digits, dot, underscore, and hyphen" >&2
  exit 2
fi
if ! [[ "$MONGO_INITDB_ROOT_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "MONGO_INITDB_ROOT_PASSWORD may contain only letters, digits, underscore, and hyphen" >&2
  exit 2
fi
if ! [[ "$REDIS_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "REDIS_PASSWORD may contain only letters, digits, underscore, and hyphen" >&2
  exit 2
fi
if [[ "${#JWT_ACCESS_SECRET}" -lt 32 ]]; then
  echo "JWT_ACCESS_SECRET must be at least 32 characters" >&2
  exit 2
fi
if [[ ! -f "$keyfile" || ! -r "$keyfile" || ! -s "$keyfile" ]]; then
  echo "MONGO_KEYFILE_FILE must name an existing, readable, non-empty MongoDB keyfile" >&2
  exit 2
fi

temporary_env="$(mktemp)"
trap 'rm -f "$temporary_env"' EXIT

write_env_value() {
  local name="$1"
  local value="$2"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "$name must not contain newline characters" >&2
    exit 2
  fi
  printf '%s=%s\n' "$name" "$value" >>"$temporary_env"
}

mongo_host="mongodb-0.mongodb-headless.${namespace}.svc.cluster.local"
mongodb_uri="mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@${mongo_host}:27017/cricpsr?authSource=admin&replicaSet=rs0"

write_env_value MONGO_INITDB_ROOT_USERNAME "$MONGO_INITDB_ROOT_USERNAME"
write_env_value MONGO_INITDB_ROOT_PASSWORD "$MONGO_INITDB_ROOT_PASSWORD"
write_env_value MONGODB_URI "$mongodb_uri"
write_env_value JWT_ACCESS_SECRET "$JWT_ACCESS_SECRET"
write_env_value REDIS_PASSWORD "$REDIS_PASSWORD"
write_env_value RAZORPAY_KEY_ID "$RAZORPAY_KEY_ID"
write_env_value RAZORPAY_KEY_SECRET "$RAZORPAY_KEY_SECRET"
write_env_value RAZORPAY_WEBHOOK_SECRET "$RAZORPAY_WEBHOOK_SECRET"

kubectl -n "$namespace" create secret generic cricpsr-secrets \
  --from-env-file="$temporary_env" \
  --from-file=mongo-keyfile="$keyfile" \
  --dry-run=client \
  -o yaml \
  | kubectl apply -f -
