#!/usr/bin/env bash
# ============================================================
# Database Restore Script
# ============================================================
# Restores a compressed backup to the target database.
#
# Usage:
#   ./scripts/restore.sh <backup_file>
#   ./scripts/restore.sh crypto_explorer_2026-04-01_02-00-00.sql.gz
#   ./scripts/restore.sh s3://crypto-explorer-backups/crypto_explorer_2026-04-01.sql.gz
#
# Environment variables (required):
#   DATABASE_URL — PostgreSQL connection string for the TARGET database
#
# WARNING: This will DROP and recreate all tables in the target database.
#          Do not run against production unless you are certain.
# ============================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/tmp/backups}"

if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: ./scripts/restore.sh <backup_file_or_s3_path>"
    echo ""
    echo "Examples:"
    echo "  ./scripts/restore.sh /tmp/backups/crypto_explorer_2026-04-01.sql.gz"
    echo "  ./scripts/restore.sh s3://my-bucket/crypto_explorer_2026-04-01.sql.gz"
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set"
    exit 1
fi

echo "=== Restore started at $(date -u) ==="
echo "Target: ${DATABASE_URL%%@*}@***"

# Download from S3 if path starts with s3://
LOCAL_FILE="${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == s3://* ]]; then
    LOCAL_FILE="${LOCAL_DIR}/restore_$(basename ${BACKUP_FILE})"
    mkdir -p "${LOCAL_DIR}"
    echo "Downloading from S3..."

    DL_CMD="aws s3 cp ${BACKUP_FILE} ${LOCAL_FILE}"
    if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
        DL_CMD="${DL_CMD} --endpoint-url ${AWS_ENDPOINT_URL}"
    fi
    eval "${DL_CMD}"
fi

if [ ! -f "${LOCAL_FILE}" ]; then
    echo "ERROR: Backup file not found: ${LOCAL_FILE}"
    exit 1
fi

FILESIZE=$(du -h "${LOCAL_FILE}" | cut -f1)
echo "Restoring from: $(basename ${LOCAL_FILE}) (${FILESIZE})"

# Confirm before proceeding
echo ""
echo "WARNING: This will overwrite data in the target database."
read -p "Type 'yes' to proceed: " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Restore
echo "Decompressing and restoring..."
gunzip -c "${LOCAL_FILE}" | psql "${DATABASE_URL}" --set ON_ERROR_STOP=off 2>&1 | tail -5

# Verify
echo ""
echo "Verifying restore..."
COUNTS=$(psql "${DATABASE_URL}" -t -c "
    SELECT 'companies: ' || COUNT(*) FROM companies WHERE deleted_at IS NULL
    UNION ALL
    SELECT 'people: ' || COUNT(*) FROM people WHERE deleted_at IS NULL
    UNION ALL
    SELECT 'wallets: ' || COUNT(*) FROM wallets WHERE deleted_at IS NULL
    UNION ALL
    SELECT 'banks: ' || COUNT(*) FROM banks WHERE deleted_at IS NULL
    UNION ALL
    SELECT 'violations: ' || COUNT(*) FROM violations WHERE deleted_at IS NULL;
")
echo "${COUNTS}"

# Clean up downloaded file
if [[ "${BACKUP_FILE}" == s3://* ]]; then
    rm -f "${LOCAL_FILE}"
fi

echo ""
echo "=== Restore completed at $(date -u) ==="
