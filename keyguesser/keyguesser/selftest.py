"""Known-answer tests, runnable from the CLI without a test framework.

The vectors for private key 1 are the standard published ones, so a green
selftest means the curve maths, both hashes, base58check and bech32 all
agree with the rest of the Bitcoin ecosystem.
"""

from __future__ import annotations

import hashlib
from typing import Callable, List, Tuple

from . import curve
from .addresses import derive
from .encoding import b58check_decode, b58check_encode, bech32_decode, bech32_encode
from .hashing import _ripemd160_py, hash160, ripemd160
from .targets import classify

KEY_ONE = {
    "pubkey_compressed": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    "pubkey_uncompressed": (
        "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
        "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8"
    ),
    "wif_uncompressed": "5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf",
    "wif_compressed": "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn",
    "p2pkh_uncompressed": "1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm",
    "p2pkh_compressed": "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
    "p2wpkh": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
}

Check = Tuple[str, Callable[[], None]]


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _check_ripemd160() -> None:
    # RFC 1320-style published vectors for RIPEMD-160.
    vectors = {
        b"": "9c1185a5c5e9fc54612808977ee8f548b2258d31",
        b"abc": "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc",
        b"message digest": "5d0689ef49d2fae572b881b123a85ffa21595f36",
    }
    for data, expected in vectors.items():
        _assert(ripemd160(data).hex() == expected, f"ripemd160({data!r}) mismatch")
        _assert(_ripemd160_py(data).hex() == expected, f"pure-python ripemd160({data!r}) mismatch")
    # The fallback must agree with the platform implementation on longer input.
    blob = hashlib.sha256(b"keyguesser").digest() * 7
    _assert(_ripemd160_py(blob) == ripemd160(blob), "ripemd160 implementations disagree")


def _check_curve() -> None:
    _assert(curve.mul_g(1) == (curve.Gx, curve.Gy), "1*G is not G")
    _assert(curve.is_on_curve(curve.mul_g(1)), "G is not on the curve")
    # Doubling via the comb table must agree with generic scalar multiplication.
    for k in (2, 3, 7, 1 << 32, (1 << 200) + 12345):
        _assert(curve.mul_g(k) == curve.mul(k, (curve.Gx, curve.Gy)), f"{k}*G mismatch")
        _assert(curve.is_on_curve(curve.mul_g(k)), f"{k}*G is off the curve")
    # The incremental walk must produce exactly the same points.
    start = (1 << 96) + 7
    for offset, (key, point) in enumerate(curve.walk_from(start, 8)):
        _assert(key == start + offset, "walk produced the wrong key")
        _assert(point == curve.mul_g(key), "walk point disagrees with mul_g")


def _check_key_one() -> None:
    info = derive(1)
    for field in ("pubkey_compressed", "pubkey_uncompressed", "wif_compressed", "wif_uncompressed"):
        _assert(info[field] == KEY_ONE[field], f"key 1 {field} mismatch: {info[field]}")
    for label in ("p2pkh_compressed", "p2pkh_uncompressed", "p2wpkh"):
        _assert(
            info["addresses"][label] == KEY_ONE[label],
            f"key 1 {label} mismatch: {info['addresses'][label]}",
        )
    _assert(
        info["hash160_compressed"] == "751e76e8199196d454941c45d1b3a323f1433bd6",
        "key 1 hash160 mismatch",
    )


def _check_encodings() -> None:
    payload = bytes.fromhex("00" + "751e76e8199196d454941c45d1b3a323f1433bd6")
    encoded = b58check_encode(payload)
    _assert(encoded == KEY_ONE["p2pkh_compressed"], "base58check encode mismatch")
    _assert(b58check_decode(encoded) == payload, "base58check round trip failed")

    program = bytes.fromhex("751e76e8199196d454941c45d1b3a323f1433bd6")
    address = bech32_encode("bc", 0, program)
    _assert(address == KEY_ONE["p2wpkh"], "bech32 encode mismatch")
    _assert(bech32_decode(address) == ("bc", 0, program), "bech32 round trip failed")


def _check_targets() -> None:
    kind, digest = classify(KEY_ONE["p2pkh_compressed"])
    _assert(kind == "p2pkh", "p2pkh classification failed")
    _assert(digest.hex() == "751e76e8199196d454941c45d1b3a323f1433bd6", "p2pkh hash mismatch")
    kind, digest = classify(KEY_ONE["p2wpkh"])
    _assert(kind == "p2wpkh", "p2wpkh classification failed")
    kind, script_hash = classify(derive(1)["addresses"]["p2sh_p2wpkh"])
    _assert(kind == "p2sh-p2wpkh", "p2sh classification failed")
    expected = hash160(b"\x00\x14" + bytes.fromhex("751e76e8199196d454941c45d1b3a323f1433bd6"))
    _assert(script_hash == expected, "p2sh-p2wpkh script hash mismatch")


def _check_search() -> None:
    from .search import SearchConfig, run_search
    from .targets import build_targets

    secret = 4242
    address = derive(secret)["addresses"]["p2pkh_compressed"]
    config = SearchConfig(
        targets=build_targets([address]), mode="sequential", start=1, end=5000, workers=1
    )
    report = run_search(config)
    _assert(report.match is not None, "sequential search failed to find a planted key")
    _assert(report.match.privkey == secret, "sequential search found the wrong key")


CHECKS: List[Check] = [
    ("ripemd160 vectors", _check_ripemd160),
    ("secp256k1 arithmetic", _check_curve),
    ("base58check / bech32", _check_encodings),
    ("private key 1 vectors", _check_key_one),
    ("target decoding", _check_targets),
    ("end-to-end search", _check_search),
]


def run_selftest(verbose: bool = True) -> int:
    failures = 0
    for name, check in CHECKS:
        try:
            check()
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {name}: {exc}")
        else:
            if verbose:
                print(f"ok    {name}")
    if failures:
        print(f"\n{failures} check(s) failed")
        return 1
    if verbose:
        print("\nall checks passed")
    return 0
