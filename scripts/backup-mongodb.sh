#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
backup_dir="${BACKUP_DIR:-${repo_root}/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${backup_dir}/cricpsr-${timestamp}.archive.gz"
temporary="${archive}.partial"

if ! [[ "${retention_days}" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer" >&2
  exit 2
fi

if [[ -n "${S3_BACKUP_URI:-}" ]]; then
  if ! [[ "${S3_BACKUP_URI}" =~ ^s3://[a-z0-9][a-z0-9-]{1,61}[a-z0-9]/cricpsr/?$ ]]; then
    echo "S3_BACKUP_URI must be an s3://bucket/cricpsr prefix" >&2
    exit 2
  fi
  if ! command -v aws >/dev/null 2>&1; then
    echo "AWS CLI is required when S3_BACKUP_URI is configured" >&2
    exit 2
  fi
  s3_prefix="${S3_BACKUP_URI%/}"
fi

mkdir -p "${backup_dir}"
trap 'rm -f "${temporary}"' EXIT

docker compose -f "${repo_root}/docker-compose.yml" exec -T mongodb \
  sh -c 'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --oplog --archive' \
  | gzip -c > "${temporary}"
gzip -t "${temporary}"
mv "${temporary}" "${archive}"
sha256sum "${archive}" > "${archive}.sha256"

if [[ -n "${S3_BACKUP_URI:-}" ]]; then
  aws s3 cp --only-show-errors --sse AES256 "${archive}" "${s3_prefix}/$(basename "${archive}")"
  aws s3 cp --only-show-errors --sse AES256 "${archive}.sha256" "${s3_prefix}/$(basename "${archive}.sha256")"
fi

find "${backup_dir}" -type f -name 'cricpsr-*.archive.gz' -mtime "+${retention_days}" -delete
find "${backup_dir}" -type f -name 'cricpsr-*.archive.gz.sha256' -mtime "+${retention_days}" -delete

echo "MongoDB backup created: ${archive}"
if [[ -n "${S3_BACKUP_URI:-}" ]]; then
  echo "MongoDB backup uploaded: ${s3_prefix}/$(basename "${archive}")"
fi
