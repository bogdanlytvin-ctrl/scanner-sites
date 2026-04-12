"""
Jupiter DEX (Solana) swap integration.
Docs: https://station.jup.ag/docs/apis/swap-api
"""
import os
import base64
import logging
import aiohttp

logger = logging.getLogger(__name__)

QUOTE_URL = "https://quote-api.jup.ag/v6/quote"
SWAP_URL  = "https://quote-api.jup.ag/v6/swap"
SOL_MINT  = "So11111111111111111111111111111111111111112"
SOLANA_RPC = os.getenv("SOLANA_RPC", "https://api.mainnet-beta.solana.com")


async def get_buy_quote(session: aiohttp.ClientSession,
                        token_mint: str,
                        amount_sol: float,
                        slippage_bps: int = 500) -> dict | None:
    """Get quote to buy token with SOL."""
    params = {
        "inputMint":   SOL_MINT,
        "outputMint":  token_mint,
        "amount":      int(amount_sol * 1_000_000_000),
        "slippageBps": slippage_bps,
    }
    try:
        async with session.get(QUOTE_URL, params=params,
                               timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status == 200:
                return await r.json()
            text = await r.text()
            logger.warning("Jupiter quote %s: %s", r.status, text[:100])
    except Exception as e:
        logger.error("Jupiter quote error: %s", e)
    return None


async def get_sell_quote(session: aiohttp.ClientSession,
                         token_mint: str,
                         amount_tokens_raw: int,
                         slippage_bps: int = 500) -> dict | None:
    """Get quote to sell tokens for SOL."""
    params = {
        "inputMint":   token_mint,
        "outputMint":  SOL_MINT,
        "amount":      amount_tokens_raw,
        "slippageBps": slippage_bps,
    }
    try:
        async with session.get(QUOTE_URL, params=params,
                               timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status == 200:
                return await r.json()
            logger.warning("Jupiter sell quote %s", r.status)
    except Exception as e:
        logger.error("Jupiter sell quote error: %s", e)
    return None


async def execute_swap(session: aiohttp.ClientSession,
                       quote_response: dict,
                       public_key: str,
                       private_key_bs58: str) -> dict:
    """
    Execute swap on Jupiter.
    Returns: {"success": bool, "tx_hash": str|None, "error": str|None}
    """
    try:
        import base58  # type: ignore
        from solders.keypair import Keypair  # type: ignore
        from solders.transaction import VersionedTransaction  # type: ignore
    except ImportError as e:
        return {"success": False, "tx_hash": None, "error": f"Missing library: {e}"}

    # Get swap transaction from Jupiter
    swap_body = {
        "quoteResponse":             quote_response,
        "userPublicKey":             public_key,
        "wrapAndUnwrapSol":          True,
        "computeUnitPriceMicroLamports": 5000,
    }
    try:
        async with session.post(SWAP_URL, json=swap_body,
                                timeout=aiohttp.ClientTimeout(total=15)) as r:
            if r.status != 200:
                text = await r.text()
                return {"success": False, "tx_hash": None,
                        "error": f"Jupiter swap API {r.status}: {text[:150]}"}
            swap_data = await r.json()
    except Exception as e:
        return {"success": False, "tx_hash": None, "error": f"Swap request: {e}"}

    # Sign transaction
    try:
        pk_bytes = base58.b58decode(private_key_bs58)
        keypair = Keypair.from_bytes(pk_bytes)
        tx_bytes = base64.b64decode(swap_data["swapTransaction"])
        tx = VersionedTransaction.from_bytes(tx_bytes)
        signed_tx = VersionedTransaction(tx.message, [keypair])
        raw_signed = bytes(signed_tx)
    except Exception as e:
        return {"success": False, "tx_hash": None, "error": f"Sign error: {e}"}

    # Send to Solana
    send_payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "sendTransaction",
        "params": [
            base64.b64encode(raw_signed).decode(),
            {"encoding": "base64", "skipPreflight": False,
             "preflightCommitment": "confirmed", "maxRetries": 3},
        ],
    }
    try:
        async with session.post(SOLANA_RPC, json=send_payload,
                                timeout=aiohttp.ClientTimeout(total=30)) as r:
            data = await r.json()
            if "result" in data:
                return {"success": True, "tx_hash": data["result"], "error": None}
            err = data.get("error", {}).get("message", "Unknown RPC error")
            return {"success": False, "tx_hash": None, "error": err}
    except Exception as e:
        return {"success": False, "tx_hash": None, "error": f"Send tx: {e}"}
