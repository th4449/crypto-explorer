#!/usr/bin/env bash
# ============================================================
# Database Backup Script
# ============================================================
# Creates a compressed pg_dump, uploads to S3-compatible storage,
# and deletes backups older than 30 days.
#
# Usage:
#   ./scripts/backup.sh
#
# Environment variables (required):
#   DATABASE_URL    — PostgreSQL connection string
#   BACKUP_BUCKET   — S3 bucket name (e.g. s3://crypto-explorer-backups)
#
# Environment variables (optional):
#   AWS_ACCESS_KEY_ID     — S3 credentials (or use instance role)
#   AWS_SECRET_ACCESS_KEY
#   AWS_ENDPOINT_URL      — For non-AWS S3-compatible storage (R2, Backblaze, etc.)
#   BACKUP_RETENTION_DAYS — How many days to keep (default: 30)
#   BACKUP_LOCAL_DIR      — Local backup directory (default: /tmp/backups)
#
# Cron example (daily at 2am UTC):
#   0 2 * * * cd /app && ./scripts/backup.sh >> /var/log/backup.log 2>&1
# ============================================================

set -euo pipefail

# Configuration
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/tmp/backups}"
FILENAME="crypto_explorer_${TIMESTAMP}.sql.gz"
FILEPATH="${LOCAL_DIR}/${FILENAME}"

# Marker file for the status endpoint to read
STATUS_FILE="${LOCAL_DIR}/.last_backup"

echo "=== Backup started at $(date -u) ==="

# Validate required env vars
if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set"
    exit 1
fi

# Create local backup directory
mkdir -p "${LOCAL_DIR}"

# Step 1: Create the compressed dump
echo "Creating dump: ${FILENAME}"
pg_dump "${DATABASE_URL}" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    | gzip > "${FILEPATH}"

FILESIZE=$(du -h "${FILEPATH}" | cut -f1)
echo "Dump created: ${FILESIZE}"

# Write the status marker
echo "${TIMESTAMP}" > "${STATUS_FILE}"

# Step 2: Upload to S3 (if bucket is configured)
if [ -n "${BACKUP_BUCKET:-}" ]; then
    echo "Uploading to ${BACKUP_BUCKET}..."

    # Build the aws CLI command with optional endpoint
    AWS_CMD="aws s3 cp ${FILEPATH} ${BACKUP_BUCKET}/${FILENAME}"
    if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
        AWS_CMD="${AWS_CMD} --endpoint-url ${AWS_ENDPOINT_URL}"
    fi

    eval "${AWS_CMD}"
    echo "Upload complete."

    # Step 3: Delete old backups from S3
    echo "Cleaning backups older than ${RETENTION_DAYS} days..."
    CUTOFF_DATE=$(date -u -d "${RETENTION_DAYS} days ago" +"%Y-%m-%d" 2>/dev/null || \
                  date -u -v-${RETENTION_DAYS}d +"%Y-%m-%d" 2>/dev/null || \
                  echo "")

    if [ -n "${CUTOFF_DATE}" ]; then
        LIST_CMD="aws s3 ls ${BACKUP_BUCKET}/"
        if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
            LIST_CMD="${LIST_CMD} --endpoint-url ${AWS_ENDPOINT_URL}"
        fi

        eval "${LIST_CMD}" | while read -r line; do
            FILE_DATE=$(echo "${line}" | awk '{print $1}')
            FILE_NAME=$(echo "${line}" | awk '{print $4}')
            if [ -n "${FILE_DATE}" ] && [ -n "${FILE_NAME}" ] && [ "${FILE_DATE}" \< "${CUTOFF_DATE}" ]; then
                DEL_CMD="aws s3 rm ${BACKUP_BUCKET}/${FILE_NAME}"
                if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
                    DEL_CMD="${DEL_CMD} --endpoint-url ${AWS_ENDPOINT_URL}"
                fi
                echo "  Deleting old backup: ${FILE_NAME}"
                eval "${DEL_CMD}"
            fi
        done
    fi
else
    echo "BACKUP_BUCKET not set — backup stored locally only at ${FILEPATH}"

    # Clean old local backups
    echo "Cleaning local backups older than ${RETENTION_DAYS} days..."
    find "${LOCAL_DIR}" -name "crypto_explorer_*.sql.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
fi

echo "=== Backup completed at $(date -u) ==="
echo "File: ${FILENAME} (${FILESIZE})"
