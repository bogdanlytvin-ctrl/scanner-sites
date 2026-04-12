"""
BSC / PancakeSwap v2 swap integration.
"""
import os
import time
import logging

logger = logging.getLogger(__name__)

BSC_RPC        = os.getenv("BSC_RPC", "https://bsc-dataseed.binance.org")
PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E"
WBNB           = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"

_ROUTER_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "amountIn",  "type": "uint256"},
            {"internalType": "address[]","name": "path",     "type": "address[]"},
        ],
        "name": "getAmountsOut",
        "outputs": [{"internalType": "uint256[]","name": "amounts","type": "uint256[]"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256","name": "amountOutMin","type": "uint256"},
            {"internalType": "address[]","name": "path","type": "address[]"},
            {"internalType": "address","name": "to","type": "address"},
            {"internalType": "uint256","name": "deadline","type": "uint256"},
        ],
        "name": "swapExactETHForTokensSupportingFeeOnTransferTokens",
        "outputs": [{"internalType": "uint256[]","name": "amounts","type": "uint256[]"}],
        "stateMutability": "payable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256","name": "amountIn","type": "uint256"},
            {"internalType": "uint256","name": "amountOutMin","type": "uint256"},
            {"internalType": "address[]","name": "path","type": "address[]"},
            {"internalType": "address","name": "to","type": "address"},
            {"internalType": "uint256","name": "deadline","type": "uint256"},
        ],
        "name": "swapExactTokensForETHSupportingFeeOnTransferTokens",
        "outputs": [{"internalType": "uint256[]","name": "amounts","type": "uint256[]"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

_ERC20_ABI = [
    {"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],
     "name":"allowance","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],
     "name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"name":"account","type":"address"}],
     "name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
]


def _w3():
    from web3 import Web3  # type: ignore
    return Web3(Web3.HTTPProvider(BSC_RPC))


def get_buy_quote(token_address: str, amount_bnb: float) -> dict | None:
    """Get expected tokens out for given BNB amount."""
    try:
        w3 = _w3()
        router = w3.eth.contract(
            address=w3.to_checksum_address(PANCAKE_ROUTER), abi=_ROUTER_ABI)
        amount_wei = w3.to_wei(amount_bnb, "ether")
        path = [w3.to_checksum_address(WBNB), w3.to_checksum_address(token_address)]
        amounts = router.functions.getAmountsOut(amount_wei, path).call()
        return {"amount_in_bnb": amount_bnb, "amount_out_raw": amounts[-1], "path": path}
    except Exception as e:
        logger.error("BSC buy quote error: %s", e)
        return None


def execute_buy(token_address: str, amount_bnb: float, private_key: str,
                slippage_pct: float = 10) -> dict:
    """Buy token with BNB on PancakeSwap."""
    try:
        w3 = _w3()
        account = w3.eth.account.from_key(private_key)
        router = w3.eth.contract(
            address=w3.to_checksum_address(PANCAKE_ROUTER), abi=_ROUTER_ABI)

        amount_wei = w3.to_wei(amount_bnb, "ether")
        path = [w3.to_checksum_address(WBNB), w3.to_checksum_address(token_address)]
        deadline = int(time.time()) + 300

        # Get expected amount out and apply slippage
        amounts = router.functions.getAmountsOut(amount_wei, path).call()
        amount_out_min = int(amounts[-1] * (1 - slippage_pct / 100))

        tx = router.functions.swapExactETHForTokensSupportingFeeOnTransferTokens(
            amount_out_min, path, account.address, deadline
        ).build_transaction({
            "from":     account.address,
            "value":    amount_wei,
            "gas":      300_000,
            "gasPrice": w3.eth.gas_price,
            "nonce":    w3.eth.get_transaction_count(account.address),
            "chainId":  56,
        })
        signed = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"success": True, "tx_hash": tx_hash.hex(), "error": None}
    except Exception as e:
        logger.error("BSC buy error: %s", e)
        return {"success": False, "tx_hash": None, "error": str(e)}


def execute_sell(token_address: str, amount_tokens_raw: int, private_key: str,
                 slippage_pct: float = 10) -> dict:
    """Sell tokens for BNB on PancakeSwap."""
    try:
        w3 = _w3()
        account = w3.eth.account.from_key(private_key)
        router = w3.eth.contract(
            address=w3.to_checksum_address(PANCAKE_ROUTER), abi=_ROUTER_ABI)
        token = w3.eth.contract(
            address=w3.to_checksum_address(token_address), abi=_ERC20_ABI)

        path = [w3.to_checksum_address(token_address), w3.to_checksum_address(WBNB)]
        deadline = int(time.time()) + 300

        # Check allowance and approve if needed (send exactly once)
        allowance = token.functions.allowance(
            account.address, w3.to_checksum_address(PANCAKE_ROUTER)).call()
        if allowance < amount_tokens_raw:
            approve_tx = token.functions.approve(
                w3.to_checksum_address(PANCAKE_ROUTER), 2**256 - 1
            ).build_transaction({
                "from": account.address, "gas": 100_000,
                "gasPrice": w3.eth.gas_price,
                "nonce": w3.eth.get_transaction_count(account.address),
                "chainId": 56,
            })
            signed_approve = w3.eth.account.sign_transaction(approve_tx, private_key)
            approve_hash = w3.eth.send_raw_transaction(signed_approve.raw_transaction)
            w3.eth.wait_for_transaction_receipt(approve_hash, timeout=60)

        amounts = router.functions.getAmountsOut(amount_tokens_raw, path).call()
        amount_out_min = int(amounts[-1] * (1 - slippage_pct / 100))

        tx = router.functions.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amount_tokens_raw, amount_out_min, path, account.address, deadline
        ).build_transaction({
            "from":     account.address,
            "gas":      300_000,
            "gasPrice": w3.eth.gas_price,
            "nonce":    w3.eth.get_transaction_count(account.address),
            "chainId":  56,
        })
        signed = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"success": True, "tx_hash": tx_hash.hex(), "error": None}
    except Exception as e:
        logger.error("BSC sell error: %s", e)
        return {"success": False, "tx_hash": None, "error": str(e)}
