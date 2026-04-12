"""
Wallet utilities: balance checking and private key encryption.
"""
import os
import logging
import aiohttp

logger = logging.getLogger(__name__)

SOLANA_RPC = os.getenv("SOLANA_RPC", "https://api.mainnet-beta.solana.com")
BSC_RPC    = os.getenv("BSC_RPC",    "https://bsc-dataseed.binance.org")

_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is not None:
        return _fernet
    from cryptography.fernet import Fernet
    key = os.getenv("ENCRYPTION_KEY", "")
    if not key:
        return None
    try:
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        logger.error("Invalid ENCRYPTION_KEY")
    return _fernet


def can_trade() -> bool:
    """Returns True if encryption key is configured (trading enabled)."""
    return _get_fernet() is not None


def generate_encryption_key() -> str:
    """Generate a new Fernet key. Set as ENCRYPTION_KEY env var."""
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode()


def encrypt_pk(private_key: str) -> str | None:
    f = _get_fernet()
    if not f:
        return None
    return f.encrypt(private_key.encode()).decode()


def decrypt_pk(encrypted: str) -> str | None:
    f = _get_fernet()
    if not f:
        return None
    try:
        return f.decrypt(encrypted.encode()).decode()
    except Exception:
        return None


async def get_sol_balance(address: str) -> float:
    payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "getBalance",
        "params": [address, {"commitment": "confirmed"}],
    }
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(SOLANA_RPC, json=payload,
                              timeout=aiohttp.ClientTimeout(total=10)) as r:
                data = await r.json()
                lamports = data.get("result", {}).get("value", 0)
                return round(lamports / 1_000_000_000, 6)
    except Exception as e:
        logger.error("SOL balance error: %s", e)
        return 0.0


async def get_sol_token_balances(address: str) -> list[dict]:
    payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "getTokenAccountsByOwner",
        "params": [
            address,
            {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
            {"encoding": "jsonParsed", "commitment": "confirmed"},
        ],
    }
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(SOLANA_RPC, json=payload,
                              timeout=aiohttp.ClientTimeout(total=10)) as r:
                data = await r.json()
                accounts = data.get("result", {}).get("value", [])
                tokens = []
                for acc in accounts:
                    info = (acc.get("account", {})
                               .get("data", {})
                               .get("parsed", {})
                               .get("info", {}))
                    ta = info.get("tokenAmount", {})
                    ui = float(ta.get("uiAmount") or 0)
                    if ui > 0:
                        tokens.append({
                            "mint":     info.get("mint", ""),
                            "amount":   ui,
                            "decimals": ta.get("decimals", 0),
                        })
                return tokens
    except Exception as e:
        logger.error("SOL tokens error: %s", e)
        return []


async def get_bnb_balance(address: str) -> float:
    payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "eth_getBalance",
        "params": [address, "latest"],
    }
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(BSC_RPC, json=payload,
                              timeout=aiohttp.ClientTimeout(total=10)) as r:
                data = await r.json()
                wei = int(data.get("result", "0x0"), 16)
                return round(wei / 1e18, 6)
    except Exception as e:
        logger.error("BNB balance error: %s", e)
        return 0.0


def is_valid_solana_address(address: str) -> bool:
    import re
    return bool(re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address))


def is_valid_evm_address(address: str) -> bool:
    import re
    return bool(re.match(r'^0x[0-9a-fA-F]{40}$', address))
