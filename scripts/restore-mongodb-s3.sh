#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "Usage: RESTORE_CONFIRM=RESTORE bash scripts/restore-mongodb-s3.sh s3://bucket/cricpsr/<backup.archive.gz>" >&2
  exit 2
fi

if [[ "${RESTORE_CONFIRM:-}" != "RESTORE" ]]; then
  echo "Refusing destructive restore. Set RESTORE_CONFIRM=RESTORE after reviewing the recovery runbook." >&2
  exit 2
fi

s3_uri="$1"
if ! [[ "${s3_uri}" =~ ^s3://[a-z0-9][a-z0-9-]{1,61}[a-z0-9]/cricpsr/cricpsr-[0-9TZ]+\.archive\.gz$ ]]; then
  echo "Provide an S3 MongoDB archive URI under the cricpsr/ prefix" >&2
  exit 2
fi
if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required to restore an S3 backup" >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "${temporary_dir}"' EXIT

archive="${temporary_dir}/$(basename "${s3_uri}")"
checksum="${archive}.sha256"
aws s3 cp --only-show-errors "${s3_uri}" "${archive}"
aws s3 cp --only-show-errors "${s3_uri}.sha256" "${checksum}"

expected_hash="$(awk 'NR == 1 {print $1}' "${checksum}")"
actual_hash="$(sha256sum "${archive}" | awk '{print $1}')"
if ! [[ "${expected_hash}" =~ ^[[:xdigit:]]{64}$ ]] || [[ "${expected_hash}" != "${actual_hash}" ]]; then
  echo "S3 backup checksum verification failed" >&2
  exit 1
fi

RESTORE_CONFIRM=RESTORE bash "${repo_root}/scripts/restore-mongodb.sh" "${archive}"
