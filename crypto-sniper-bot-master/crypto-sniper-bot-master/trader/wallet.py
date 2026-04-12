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


async def get_sol_token_balance_raw(wallet_address: str, mint: str) -> tuple[int, int]:
    """
    Returns (raw_amount, decimals) for the given SPL token mint in the wallet.
    raw_amount is in the smallest unit (i.e. amount * 10^decimals).
    Returns (0, 0) if not found or on error.
    """
    payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "getTokenAccountsByOwner",
        "params": [
            wallet_address,
            {"mint": mint},
            {"encoding": "jsonParsed", "commitment": "confirmed"},
        ],
    }
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(SOLANA_RPC, json=payload,
                              timeout=aiohttp.ClientTimeout(total=10)) as r:
                data = await r.json()
                accounts = data.get("result", {}).get("value", [])
                if not accounts:
                    return (0, 0)
                info = (accounts[0].get("account", {})
                                   .get("data", {})
                                   .get("parsed", {})
                                   .get("info", {}))
                ta       = info.get("tokenAmount", {})
                decimals = int(ta.get("decimals", 0))
                raw_amt  = int(ta.get("amount", 0))
                return (raw_amt, decimals)
    except Exception as e:
        logger.error("SOL token balance raw error: %s", e)
        return (0, 0)


async def get_bsc_token_balance_raw(wallet_address: str, token_address: str) -> tuple[int, int]:
    """
    Returns (raw_amount, decimals) for the given BEP-20 token.
    Uses eth_call on balanceOf + decimals.
    """
    _ERC20_BALANCE_ABI = [
        {"inputs":[{"name":"account","type":"address"}],
         "name":"balanceOf","outputs":[{"name":"","type":"uint256"}],
         "stateMutability":"view","type":"function"},
        {"inputs":[],"name":"decimals",
         "outputs":[{"name":"","type":"uint8"}],
         "stateMutability":"view","type":"function"},
    ]
    try:
        import asyncio as _asyncio

        def _read():
            from web3 import Web3  # type: ignore
            w3 = Web3(Web3.HTTPProvider(BSC_RPC))
            contract = w3.eth.contract(
                address=w3.to_checksum_address(token_address),
                abi=_ERC20_BALANCE_ABI,
            )
            decimals = contract.functions.decimals().call()
            balance  = contract.functions.balanceOf(
                w3.to_checksum_address(wallet_address)).call()
            return (balance, decimals)

        return await _asyncio.to_thread(_read)
    except Exception as e:
        logger.error("BSC token balance raw error: %s", e)
        return (0, 0)


def is_valid_solana_address(address: str) -> bool:
    import re
    return bool(re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address))


def is_valid_evm_address(address: str) -> bool:
    import re
    return bool(re.match(r'^0x[0-9a-fA-F]{40}$', address))


def is_valid_solana_private_key(pk: str) -> bool:
    """
    Accepts either:
      - Base58-encoded 64-byte keypair  (87-88 chars)
      - Base58-encoded 32-byte seed     (43-44 chars)
    """
    import base58  # type: ignore
    try:
        decoded = base58.b58decode(pk.strip())
        return len(decoded) in (32, 64)
    except Exception:
        return False


def is_valid_bsc_private_key(pk: str) -> bool:
    """Hex private key, 64 hex chars, optional 0x prefix."""
    import re
    clean = pk.strip()
    if clean.startswith("0x") or clean.startswith("0X"):
        clean = clean[2:]
    return bool(re.match(r'^[0-9a-fA-F]{64}$', clean))
