#!/usr/bin/env python3
"""
Daily cron job: reset API rate limit counters.

Run via cron at midnight UTC:
    0 0 * * * cd /path/to/backend && python scripts/reset_rate_limits.py

Or via the hosting platform's scheduler.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncpg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://app_user:localdevpassword@localhost:5432/crypto_explorer",
)


async def main():
    conn = await asyncpg.connect(DATABASE_URL)

    # Reset API key counters
    keys_reset = await conn.execute(
        "UPDATE api_keys SET requests_today = 0, requests_reset_at = NOW() + INTERVAL '1 day'"
    )
    print(f"API keys reset: {keys_reset}")

    # Reset IP rate limits
    ip_reset = await conn.execute(
        "UPDATE ip_rate_limits SET requests_today = 0, reset_at = NOW() + INTERVAL '1 day'"
    )
    print(f"IP rate limits reset: {ip_reset}")

    # Clean up old IP entries (older than 7 days with 0 requests)
    cleaned = await conn.execute(
        "DELETE FROM ip_rate_limits WHERE requests_today = 0 AND reset_at < NOW() - INTERVAL '7 days'"
    )
    print(f"Stale IP entries cleaned: {cleaned}")

    await conn.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
