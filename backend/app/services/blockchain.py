"""
Blockchain data enrichment service.

Fetches wallet balance, transaction count, and recent transactions
from Blockscout (primary) and Etherscan (fallback) APIs.

Data is cached in the wallet_enrichment table with a 24-hour TTL.
"""

import json
import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx

from app.database import get_pool

# API configuration
ETHERSCAN_KEY = os.getenv("ETHERSCAN_API_KEY", "")
BLOCKSCOUT_BASE = "https://eth.blockscout.com/api/v2"

# Chain-specific Blockscout instances
BLOCKSCOUT_CHAINS: dict[str, str] = {
    "ethereum": "https://eth.blockscout.com/api/v2",
    "eth": "https://eth.blockscout.com/api/v2",
    "polygon": "https://polygon.blockscout.com/api/v2",
    "bsc": "https://bsc.blockscout.com/api/v2",
    "gnosis": "https://gnosis.blockscout.com/api/v2",
    "optimism": "https://optimism.blockscout.com/api/v2",
    "arbitrum": "https://arbitrum.blockscout.com/api/v2",
    "base": "https://base.blockscout.com/api/v2",
}

ETHERSCAN_CHAINS: dict[str, str] = {
    "ethereum": "https://api.etherscan.io/api",
    "eth": "https://api.etherscan.io/api",
    "bsc": "https://api.bscscan.com/api",
    "polygon": "https://api.polygonscan.com/api",
    "arbitrum": "https://api.arbiscan.io/api",
    "optimism": "https://api-optimistic.etherscan.io/api",
    "base": "https://api.basescan.org/api",
}

CACHE_TTL_HOURS = 24


async def get_cached_enrichment(wallet_id: UUID) -> dict | None:
    """Return cached enrichment data if fresh (within TTL)."""
    pool = await get_pool()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=CACHE_TTL_HOURS)

    row = await pool.fetchrow(
        """
        SELECT data, fetched_at FROM wallet_enrichment
        WHERE wallet_id = $1 AND fetched_at > $2
        """,
        wallet_id,
        cutoff,
    )
    if not row:
        return None

    data = row["data"]
    if isinstance(data, str):
        data = json.loads(data)
    data["_cached"] = True
    data["_fetched_at"] = row["fetched_at"].isoformat()
    return data


async def store_enrichment(wallet_id: UUID, data: dict) -> None:
    """Upsert enrichment data for a wallet."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO wallet_enrichment (wallet_id, data, fetched_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (wallet_id) DO UPDATE
            SET data = $2, fetched_at = NOW()
            """,
            wallet_id,
            json.dumps(data),
        )


async def fetch_from_blockscout(address: str, blockchain: str) -> dict | None:
    """Fetch wallet data from the Blockscout API."""
    base = BLOCKSCOUT_CHAINS.get(blockchain.lower())
    if not base:
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Address info (balance + tx count)
            addr_resp = await client.get(f"{base}/addresses/{address}")
            if addr_resp.status_code != 200:
                return None
            addr_data = addr_resp.json()

            # Recent transactions
            tx_resp = await client.get(
                f"{base}/addresses/{address}/transactions",
                params={"type": "all"},
            )
            tx_list = []
            if tx_resp.status_code == 200:
                tx_data = tx_resp.json()
                items = tx_data.get("items", [])[:20]
                for tx in items:
                    tx_list.append(_parse_blockscout_tx(tx, address))

            # Build result
            balance_wei = addr_data.get("coin_balance", "0")
            balance_eth = int(balance_wei) / 1e18 if balance_wei else 0

            return {
                "source": "blockscout",
                "balance": str(round(balance_eth, 8)),
                "balance_wei": str(balance_wei),
                "tx_count": addr_data.get("transactions_count", 0),
                "token_transfers": addr_data.get("token_transfers_count", 0),
                "is_contract": addr_data.get("is_contract", False),
                "transactions": tx_list,
            }

    except Exception:
        return None


def _parse_blockscout_tx(tx: dict, address: str) -> dict:
    """Parse a single Blockscout transaction into our standard format."""
    from_addr = (tx.get("from", {}) or {}).get("hash", "") if isinstance(tx.get("from"), dict) else tx.get("from", "")
    to_addr = (tx.get("to", {}) or {}).get("hash", "") if isinstance(tx.get("to"), dict) else tx.get("to", "")

    value_wei = tx.get("value", "0")
    try:
        value_eth = int(value_wei) / 1e18
    except (ValueError, TypeError):
        value_eth = 0

    direction = "out" if from_addr.lower() == address.lower() else "in"
    counterparty = to_addr if direction == "out" else from_addr

    return {
        "hash": tx.get("hash", ""),
        "timestamp": tx.get("timestamp", ""),
        "direction": direction,
        "counterparty": counterparty,
        "amount": str(round(value_eth, 8)),
        "status": tx.get("status", ""),
        "block": tx.get("block", ""),
    }


async def fetch_from_etherscan(address: str, blockchain: str) -> dict | None:
    """Fallback: fetch wallet data from the Etherscan API."""
    if not ETHERSCAN_KEY:
        return None

    base = ETHERSCAN_CHAINS.get(blockchain.lower())
    if not base:
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Balance
            bal_resp = await client.get(base, params={
                "module": "account",
                "action": "balance",
                "address": address,
                "tag": "latest",
                "apikey": ETHERSCAN_KEY,
            })
            bal_data = bal_resp.json()
            balance_wei = bal_data.get("result", "0")
            balance_eth = int(balance_wei) / 1e18 if balance_wei.isdigit() else 0

            # Transaction count
            count_resp = await client.get(base, params={
                "module": "proxy",
                "action": "eth_getTransactionCount",
                "address": address,
                "tag": "latest",
                "apikey": ETHERSCAN_KEY,
            })
            count_data = count_resp.json()
            tx_count_hex = count_data.get("result", "0x0")
            tx_count = int(tx_count_hex, 16) if tx_count_hex.startswith("0x") else 0

            # Last 20 transactions
            tx_resp = await client.get(base, params={
                "module": "account",
                "action": "txlist",
                "address": address,
                "startblock": 0,
                "endblock": 99999999,
                "page": 1,
                "offset": 20,
                "sort": "desc",
                "apikey": ETHERSCAN_KEY,
            })
            tx_data = tx_resp.json()
            tx_list = []
            for tx in tx_data.get("result", [])[:20]:
                if isinstance(tx, dict):
                    tx_list.append(_parse_etherscan_tx(tx, address))

            return {
                "source": "etherscan",
                "balance": str(round(balance_eth, 8)),
                "balance_wei": str(balance_wei),
                "tx_count": tx_count,
                "transactions": tx_list,
            }

    except Exception:
        return None


def _parse_etherscan_tx(tx: dict, address: str) -> dict:
    """Parse a single Etherscan transaction."""
    from_addr = tx.get("from", "")
    to_addr = tx.get("to", "")

    value_wei = tx.get("value", "0")
    try:
        value_eth = int(value_wei) / 1e18
    except (ValueError, TypeError):
        value_eth = 0

    direction = "out" if from_addr.lower() == address.lower() else "in"
    counterparty = to_addr if direction == "out" else from_addr

    timestamp = tx.get("timeStamp", "")
    if timestamp.isdigit():
        timestamp = datetime.fromtimestamp(int(timestamp), tz=timezone.utc).isoformat()

    return {
        "hash": tx.get("hash", ""),
        "timestamp": timestamp,
        "direction": direction,
        "counterparty": counterparty,
        "amount": str(round(value_eth, 8)),
        "status": "ok" if tx.get("isError") == "0" else "error",
        "block": tx.get("blockNumber", ""),
    }


async def enrich_wallet(wallet_id: UUID, address: str, blockchain: str) -> dict:
    """
    Main entry point. Returns cached data if fresh, otherwise fetches
    from Blockscout (primary) then Etherscan (fallback), caches, and returns.
    """
    # Check cache first
    cached = await get_cached_enrichment(wallet_id)
    if cached:
        return cached

    # Try Blockscout first
    data = await fetch_from_blockscout(address, blockchain)

    # Fallback to Etherscan
    if not data:
        data = await fetch_from_etherscan(address, blockchain)

    if not data:
        return {
            "source": "none",
            "error": "Could not fetch blockchain data. The blockchain may not be supported or the APIs may be temporarily unavailable.",
            "balance": "0",
            "tx_count": 0,
            "transactions": [],
        }

    # Store in cache
    await store_enrichment(wallet_id, data)

    data["_cached"] = False
    data["_fetched_at"] = datetime.now(timezone.utc).isoformat()
    return data


async def refresh_verified_wallets() -> dict:
    """
    Background task: refresh enrichment data for all verified wallets.
    Returns count of wallets refreshed.
    """
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, address, blockchain FROM wallets
        WHERE verification_tier = 'verified' AND deleted_at IS NULL
        """
    )

    refreshed = 0
    failed = 0

    for row in rows:
        try:
            data = await fetch_from_blockscout(row["address"], row["blockchain"])
            if not data:
                data = await fetch_from_etherscan(row["address"], row["blockchain"])
            if data:
                await store_enrichment(row["id"], data)
                refreshed += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    return {"refreshed": refreshed, "failed": failed, "total": len(rows)}
