#!/usr/bin/env bash
# ============================================================
# Uptime Monitor
# ============================================================
# Pings the health endpoint and sends an email alert on failure.
#
# Usage:
#   ./scripts/uptime_check.sh
#
# Environment variables (required):
#   HEALTH_URL    — Full URL to the health endpoint
#                   (e.g. https://api.your-domain.com/health)
#
# Environment variables (optional):
#   ALERT_EMAIL   — Email address for failure alerts
#   SMTP_HOST     — SMTP server for sending alerts
#   SMTP_PORT     — SMTP port (default: 587)
#   SMTP_USER     — SMTP username
#   SMTP_PASS     — SMTP password
#   ALERT_FROM    — From address for alert emails
#
# Cron example (every 5 minutes):
#   */5 * * * * cd /app && ./scripts/uptime_check.sh >> /var/log/uptime.log 2>&1
#
# Alternative: Use a free uptime monitoring service instead:
#   - UptimeRobot (https://uptimerobot.com) — 50 monitors free
#   - Freshping (https://freshping.io) — 50 monitors free
#   - Better Uptime (https://betteruptime.com) — 10 monitors free
# ============================================================

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost:8000/health}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
TIMEOUT=10
RETRIES=2
STATE_FILE="/tmp/.uptime_state"

check_health() {
    local attempt=0
    while [ $attempt -lt $RETRIES ]; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
            --connect-timeout "${TIMEOUT}" \
            --max-time "${TIMEOUT}" \
            "${HEALTH_URL}" 2>/dev/null || echo "000")

        if [ "${HTTP_CODE}" = "200" ]; then
            return 0
        fi

        attempt=$((attempt + 1))
        [ $attempt -lt $RETRIES ] && sleep 5
    done

    return 1
}

send_alert() {
    local subject="$1"
    local body="$2"

    echo "[ALERT] ${subject}"
    echo "  ${body}"

    # Send email if SMTP is configured
    if [ -n "${ALERT_EMAIL}" ] && [ -n "${SMTP_HOST:-}" ]; then
        python3 -c "
import smtplib
from email.mime.text import MIMEText
import os

msg = MIMEText('''${body}

Health URL: ${HEALTH_URL}
Timestamp: $(date -u)
''')
msg['Subject'] = '${subject}'
msg['From'] = os.getenv('ALERT_FROM', 'monitor@crypto-explorer.local')
msg['To'] = '${ALERT_EMAIL}'

try:
    server = smtplib.SMTP(os.getenv('SMTP_HOST', 'localhost'), int(os.getenv('SMTP_PORT', '587')))
    server.starttls()
    user = os.getenv('SMTP_USER', '')
    passwd = os.getenv('SMTP_PASS', '')
    if user and passwd:
        server.login(user, passwd)
    server.send_message(msg)
    server.quit()
    print('  Alert email sent to ${ALERT_EMAIL}')
except Exception as e:
    print(f'  Failed to send email: {e}')
" 2>&1
    else
        echo "  (No SMTP configured — alert logged only)"
    fi
}

# Main check
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

if check_health; then
    echo "[OK] ${TIMESTAMP} — ${HEALTH_URL} responding (HTTP 200)"

    # If previously down, send recovery alert
    if [ -f "${STATE_FILE}" ]; then
        DOWN_SINCE=$(cat "${STATE_FILE}")
        rm -f "${STATE_FILE}"
        send_alert \
            "[RECOVERED] Crypto Explorer API is back up" \
            "The health endpoint is responding again. Was down since ${DOWN_SINCE}."
    fi
else
    echo "[DOWN] ${TIMESTAMP} — ${HEALTH_URL} not responding (HTTP ${HTTP_CODE})"

    # Only alert on the first failure (not every 5 minutes)
    if [ ! -f "${STATE_FILE}" ]; then
        echo "${TIMESTAMP}" > "${STATE_FILE}"
        send_alert \
            "[DOWN] Crypto Explorer API is not responding" \
            "The health endpoint returned HTTP ${HTTP_CODE} after ${RETRIES} retries."
    fi
fi
