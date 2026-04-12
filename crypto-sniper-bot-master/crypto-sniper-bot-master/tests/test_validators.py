"""
Unit tests for address and private-key validators in trader/wallet.py.

Run:  pytest tests/test_validators.py -v
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from trader.wallet import (
    is_valid_solana_address,
    is_valid_evm_address,
    is_valid_bsc_private_key,
)


# ── Solana address ─────────────────────────────────────────────────────────────

class TestSolanaAddress:
    VALID = [
        "So11111111111111111111111111111111111111112",  # WSOL
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
        "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",  # BTC (Solana)
    ]
    INVALID = [
        "",
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",  # EVM address
        "short",
        "0" * 44,       # all zeros — invalid base58
        "l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1l1",  # contains invalid chars
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",  # 49 chars
    ]

    def test_valid(self):
        for addr in self.VALID:
            assert is_valid_solana_address(addr), f"Should be valid: {addr}"

    def test_invalid(self):
        for addr in self.INVALID:
            assert not is_valid_solana_address(addr), f"Should be invalid: {addr!r}"


# ── EVM / BSC address ──────────────────────────────────────────────────────────

class TestEVMAddress:
    VALID = [
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "0x0000000000000000000000000000000000000000",
        "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
    ]
    INVALID = [
        "",
        "71C7656EC7ab88b098defB751B7401B5f6d8976F",   # missing 0x
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976",   # too short
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976FF",  # too long
        "So11111111111111111111111111111111111111112",   # Solana address
        "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",  # invalid hex
    ]

    def test_valid(self):
        for addr in self.VALID:
            assert is_valid_evm_address(addr), f"Should be valid: {addr}"

    def test_invalid(self):
        for addr in self.INVALID:
            assert not is_valid_evm_address(addr), f"Should be invalid: {addr!r}"


# ── BSC private key ────────────────────────────────────────────────────────────

class TestBSCPrivateKey:
    VALID = [
        "a" * 64,                       # 64 hex chars, no prefix
        "0x" + "a" * 64,                # with 0x prefix
        "0X" + "A" * 64,                # uppercase 0X prefix
        "1234567890abcdef" * 4,         # 64 chars mixed case
    ]
    INVALID = [
        "",
        "a" * 63,                       # too short
        "a" * 65,                       # too long
        "0x" + "a" * 63,               # prefix + too short
        "g" * 64,                       # invalid hex char 'g'
        "So11111111111111111111111111111111111111112",  # Solana key
    ]

    def test_valid(self):
        for key in self.VALID:
            assert is_valid_bsc_private_key(key), f"Should be valid: {key[:20]}..."

    def test_invalid(self):
        for key in self.INVALID:
            assert not is_valid_bsc_private_key(key), f"Should be invalid: {key!r}"


# ── Cross-chain confusion guards ───────────────────────────────────────────────

def test_solana_address_not_accepted_as_evm():
    sol = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    assert not is_valid_evm_address(sol)


def test_evm_address_not_accepted_as_solana():
    evm = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
    assert not is_valid_solana_address(evm)
