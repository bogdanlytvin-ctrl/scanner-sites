"""
Unit tests for scanner/price_cache.py — TTL cache correctness.

Run:  pytest tests/test_price_cache.py -v
"""

import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import scanner.price_cache as pc


@pytest.fixture(autouse=True)
def clear_caches():
    """Reset module-level dicts before each test."""
    pc._price_cache.clear()
    pc._safety_cache.clear()
    yield
    pc._price_cache.clear()
    pc._safety_cache.clear()


# ── Price cache ────────────────────────────────────────────────────────────────

def test_set_and_get_price():
    pc.set_cached_price("solana", "ADDR1", 0.0123)
    assert pc.get_cached_price("solana", "ADDR1") == pytest.approx(0.0123)


def test_miss_returns_none():
    assert pc.get_cached_price("solana", "UNKNOWN") is None


def test_different_chains_dont_collide():
    pc.set_cached_price("solana", "ADDR1", 1.0)
    pc.set_cached_price("bsc",    "ADDR1", 2.0)
    assert pc.get_cached_price("solana", "ADDR1") == pytest.approx(1.0)
    assert pc.get_cached_price("bsc",    "ADDR1") == pytest.approx(2.0)


def test_expired_price_returns_none(monkeypatch):
    pc.set_cached_price("solana", "ADDR1", 5.0)
    # Simulate time passing beyond TTL
    monkeypatch.setattr(pc, "PRICE_TTL", -1)
    assert pc.get_cached_price("solana", "ADDR1") is None


def test_evict_removes_stale(monkeypatch):
    pc.set_cached_price("solana", "ADDR1", 1.0)
    pc.set_cached_price("solana", "ADDR2", 2.0)
    monkeypatch.setattr(pc, "PRICE_TTL", -1)
    removed = pc.evict_expired()
    assert removed == 2
    assert len(pc._price_cache) == 0


def test_evict_price_explicit():
    pc.set_cached_price("solana", "ADDR1", 9.9)
    pc.evict_price("solana", "ADDR1")
    assert pc.get_cached_price("solana", "ADDR1") is None


# ── Safety cache ───────────────────────────────────────────────────────────────

def test_set_and_get_safety():
    safety = {"rugcheck_score": 800, "is_honeypot": False}
    pc.set_cached_safety("solana", "ADDR1", safety)
    result = pc.get_cached_safety("solana", "ADDR1")
    assert result is not None
    assert result["rugcheck_score"] == 800


def test_safety_miss_returns_none():
    assert pc.get_cached_safety("bsc", "MISSING") is None


def test_safety_expired(monkeypatch):
    pc.set_cached_safety("bsc", "ADDR1", {"is_honeypot": True})
    monkeypatch.setattr(pc, "SAFETY_TTL", -1)
    assert pc.get_cached_safety("bsc", "ADDR1") is None


def test_evict_clears_both_caches(monkeypatch):
    pc.set_cached_price("solana", "A", 1.0)
    pc.set_cached_safety("solana", "A", {})
    monkeypatch.setattr(pc, "PRICE_TTL",  -1)
    monkeypatch.setattr(pc, "SAFETY_TTL", -1)
    removed = pc.evict_expired()
    assert removed == 2
