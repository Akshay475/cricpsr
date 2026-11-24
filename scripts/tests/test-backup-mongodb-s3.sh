#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "${temporary_dir}"' EXIT

mkdir -p "${temporary_dir}/bin" "${temporary_dir}/backups"

cat > "${temporary_dir}/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'fixture database dump\n'
EOF

cat > "${temporary_dir}/bin/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "s3" && "$2" == "cp" && "$3" == "--only-show-errors" ]]
[[ "$4" == "--sse" && "$5" == "AES256" ]]
[[ -f "$6" ]]
printf '%s\n' "$7" >> "${AWS_UPLOAD_LOG}"
EOF

chmod +x "${temporary_dir}/bin/docker" "${temporary_dir}/bin/aws"
export PATH="${temporary_dir}/bin:${PATH}"
export BACKUP_DIR="${temporary_dir}/backups"
export BACKUP_RETENTION_DAYS=14
export S3_BACKUP_URI=s3://example-backups/cricpsr
export AWS_UPLOAD_LOG="${temporary_dir}/uploads"

output="$(bash "${repo_root}/scripts/backup-mongodb.sh")"
[[ "${output}" == *"MongoDB backup uploaded: s3://example-backups/cricpsr/"* ]]
[[ "$(wc -l < "${AWS_UPLOAD_LOG}")" -eq 2 ]]
grep -qE '^s3://example-backups/cricpsr/cricpsr-[0-9TZ]+\.archive\.gz$' "${AWS_UPLOAD_LOG}"
grep -qE '^s3://example-backups/cricpsr/cricpsr-[0-9TZ]+\.archive\.gz\.sha256$' "${AWS_UPLOAD_LOG}"

echo "S3 backup upload checks passed"
