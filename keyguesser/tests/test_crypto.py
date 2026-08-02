"""Known-answer tests for the crypto primitives."""

import hashlib

import pytest

from keyguesser import curve
from keyguesser.addresses import MAINNET, TESTNET, derive, encode_pubkey, privkey_to_wif
from keyguesser.encoding import (
    DecodeError,
    b58check_decode,
    b58check_encode,
    b58decode,
    b58encode,
    bech32_decode,
    bech32_encode,
)
from keyguesser.hashing import _ripemd160_py, hash160, ripemd160

# Published vectors for the private key 1.
KEY1_PUB_C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
KEY1_H160_C = "751e76e8199196d454941c45d1b3a323f1433bd6"


@pytest.mark.parametrize(
    "data,expected",
    [
        (b"", "9c1185a5c5e9fc54612808977ee8f548b2258d31"),
        (b"a", "0bdc9d2d256b3ee9daae347be6f4dc835a467ffe"),
        (b"abc", "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc"),
        (b"message digest", "5d0689ef49d2fae572b881b123a85ffa21595f36"),
        (b"abcdefghijklmnopqrstuvwxyz", "f71c27109c692c1b56bbdceb5b9d2865b3708dbc"),
        (b"a" * 1000000, "52783243c1697bdbe16d37f97f68f08325dc1528"),
    ],
)
def test_ripemd160_vectors(data, expected):
    assert ripemd160(data).hex() == expected
    assert _ripemd160_py(data).hex() == expected


def test_ripemd160_fallback_matches_platform():
    for length in (0, 1, 55, 56, 63, 64, 65, 119, 120, 200):
        blob = hashlib.sha256(str(length).encode()).digest() * 8
        blob = blob[:length]
        assert _ripemd160_py(blob) == ripemd160(blob)


def test_generator_and_curve_membership():
    assert curve.mul_g(1) == (curve.Gx, curve.Gy)
    for k in (1, 2, 3, 255, 1 << 64, curve.N - 1):
        point = curve.mul_g(k)
        assert curve.is_on_curve(point)


def test_comb_multiplication_matches_double_and_add():
    for k in (2, 5, 999983, (1 << 128) + 1, curve.N - 2):
        assert curve.mul_g(k) == curve.mul(k, (curve.Gx, curve.Gy))


def test_walk_matches_independent_multiplication():
    start = (1 << 70) + 31337
    walked = list(curve.walk_from(start, 300))
    assert [k for k, _ in walked] == list(range(start, start + 300))
    for key, point in walked[::37]:
        assert point == curve.mul_g(key)


def test_batch_to_affine_matches_single():
    points = [curve.mul_g_jacobian(k) for k in range(1, 40)]
    batched = curve.batch_to_affine(points)
    assert batched == [curve.to_affine(p) for p in points]


def test_key_one_full_derivation():
    info = derive(1)
    assert info["pubkey_compressed"] == KEY1_PUB_C
    assert info["pubkey_uncompressed"].startswith("0479be667e")
    assert info["hash160_compressed"] == KEY1_H160_C
    assert info["wif_compressed"] == "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn"
    assert info["wif_uncompressed"] == "5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf"
    assert info["addresses"]["p2pkh_compressed"] == "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH"
    assert info["addresses"]["p2pkh_uncompressed"] == "1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm"
    assert info["addresses"]["p2wpkh"] == "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"


def test_p2sh_p2wpkh_wraps_the_witness_program():
    info = derive(1)
    address = info["addresses"]["p2sh_p2wpkh"]
    payload = b58check_decode(address)
    assert payload[0] == MAINNET.p2sh_version
    assert payload[1:] == hash160(b"\x00\x14" + bytes.fromhex(KEY1_H160_C))


def test_derive_rejects_out_of_range_keys():
    with pytest.raises(ValueError):
        derive(0)
    with pytest.raises(ValueError):
        derive(curve.N)


def test_testnet_prefixes():
    info = derive(1, TESTNET)
    assert info["addresses"]["p2pkh_compressed"].startswith(("m", "n"))
    assert info["addresses"]["p2wpkh"].startswith("tb1")
    assert privkey_to_wif(1, True, TESTNET).startswith("c")


def test_pubkey_parity_prefix():
    for k in (1, 2, 3, 4, 5):
        x, y = curve.mul_g(k)
        assert encode_pubkey((x, y), True)[0] == 2 + (y & 1)


def test_base58_round_trip_preserves_leading_zeros():
    payload = b"\x00\x00" + bytes(range(20))
    assert b58decode(b58encode(payload)) == payload
    assert b58check_decode(b58check_encode(payload)) == payload


def test_base58check_rejects_bad_checksum():
    good = "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH"
    with pytest.raises(DecodeError):
        b58check_decode(good[:-1] + ("1" if good[-1] != "1" else "2"))


@pytest.mark.parametrize(
    "address",
    [
        "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7",
    ],
)
def test_bech32_round_trip(address):
    hrp, version, program = bech32_decode(address)
    assert bech32_encode(hrp, version, program) == address


def test_bech32_rejects_corrupted_checksum():
    with pytest.raises(DecodeError):
        bech32_decode("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5")
