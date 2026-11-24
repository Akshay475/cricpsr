#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "Usage: RESTORE_CONFIRM=RESTORE bash scripts/restore-mongodb.sh <backup.archive.gz>" >&2
  exit 2
fi

if [[ "${RESTORE_CONFIRM:-}" != "RESTORE" ]]; then
  echo "Refusing destructive restore. Set RESTORE_CONFIRM=RESTORE after reviewing the recovery runbook." >&2
  exit 2
fi

backup_file="$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")"
if [[ ! -f "${backup_file}" ]]; then
  echo "Backup file not found: ${backup_file}" >&2
  exit 2
fi
gzip -t "${backup_file}"

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Restoring cricpsr database and replacing matching collections from ${backup_file}"
gzip -dc "${backup_file}" \
  | docker compose -f "${repo_root}/docker-compose.yml" exec -T mongodb sh -c \
      'mongorestore --host 127.0.0.1:27017 --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --drop --stopOnError --oplogReplay --archive'
echo "MongoDB restore completed. Verify the API and application data before reopening traffic."
