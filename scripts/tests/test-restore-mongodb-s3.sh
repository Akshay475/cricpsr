#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "${temporary_dir}"' EXIT

mkdir -p "${temporary_dir}/bin" "${temporary_dir}/fixtures"
fixture="${temporary_dir}/fixtures/cricpsr-20261124T000000Z.archive.gz"
printf 'fixture database dump\n' | gzip -c > "${fixture}"
sha256sum "${fixture}" > "${fixture}.sha256"

cat > "${temporary_dir}/bin/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "s3" && "$2" == "cp" && "$3" == "--only-show-errors" ]]
case "$4" in
  *.sha256) cp "${FIXTURE}.sha256" "$5" ;;
  *.archive.gz) cp "${FIXTURE}" "$5" ;;
  *) exit 2 ;;
esac
EOF

cat > "${temporary_dir}/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'called\n' > "${FAKE_DOCKER_CALLED}"
cat > /dev/null
EOF

chmod +x "${temporary_dir}/bin/aws" "${temporary_dir}/bin/docker"
export FIXTURE="${fixture}"
export FAKE_DOCKER_CALLED="${temporary_dir}/docker-called"
export PATH="${temporary_dir}/bin:${PATH}"
backup_uri="s3://example-backups/cricpsr/$(basename "${fixture}")"

output="$(RESTORE_CONFIRM=RESTORE bash "${repo_root}/scripts/restore-mongodb-s3.sh" "${backup_uri}")"
[[ "${output}" == *"MongoDB restore completed."* ]]
[[ -f "${FAKE_DOCKER_CALLED}" ]]

printf '%064d  wrong.archive.gz\n' 0 > "${fixture}.sha256"
if RESTORE_CONFIRM=RESTORE bash "${repo_root}/scripts/restore-mongodb-s3.sh" "${backup_uri}" >/dev/null 2>&1; then
  echo "Restore unexpectedly accepted a mismatched checksum" >&2
  exit 1
else
  status=$?
  [[ "${status}" -eq 1 ]]
fi

if RESTORE_CONFIRM= bash "${repo_root}/scripts/restore-mongodb-s3.sh" "${backup_uri}" >/dev/null 2>&1; then
  echo "Restore unexpectedly accepted a missing confirmation" >&2
  exit 1
else
  status=$?
  [[ "${status}" -eq 2 ]]
fi

echo "S3 restore safety checks passed"
