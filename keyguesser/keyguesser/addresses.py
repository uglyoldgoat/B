"""Private key -> public key -> address derivation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

from . import curve
from .encoding import b58check_encode, bech32_encode
from .hashing import hash160


@dataclass(frozen=True)
class Network:
    name: str
    p2pkh_version: int
    p2sh_version: int
    wif_version: int
    hrp: str


MAINNET = Network("mainnet", 0x00, 0x05, 0x80, "bc")
TESTNET = Network("testnet", 0x6F, 0xC4, 0xEF, "tb")
NETWORKS = {"mainnet": MAINNET, "testnet": TESTNET}


def encode_pubkey(point: Tuple[int, int], compressed: bool = True) -> bytes:
    x, y = point
    if compressed:
        return bytes([2 + (y & 1)]) + x.to_bytes(32, "big")
    return b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")


def privkey_to_wif(privkey: int, compressed: bool = True, network: Network = MAINNET) -> str:
    payload = bytes([network.wif_version]) + privkey.to_bytes(32, "big")
    if compressed:
        payload += b"\x01"
    return b58check_encode(payload)


def p2pkh_address(keyhash: bytes, network: Network = MAINNET) -> str:
    return b58check_encode(bytes([network.p2pkh_version]) + keyhash)


def p2wpkh_address(keyhash: bytes, network: Network = MAINNET) -> str:
    return bech32_encode(network.hrp, 0, keyhash)


def p2wpkh_redeem_script(keyhash: bytes) -> bytes:
    """The witness program used as a P2SH redeem script (BIP-141)."""
    return b"\x00\x14" + keyhash


def p2sh_p2wpkh_address(keyhash: bytes, network: Network = MAINNET) -> str:
    script_hash = hash160(p2wpkh_redeem_script(keyhash))
    return b58check_encode(bytes([network.p2sh_version]) + script_hash)


def derive(privkey: int, network: Network = MAINNET) -> Dict[str, object]:
    """Everything derivable from one private key, for display purposes."""
    if not 1 <= privkey < curve.N:
        raise ValueError("private key out of range for secp256k1")
    point = curve.mul_g(privkey)
    compressed = encode_pubkey(point, True)
    uncompressed = encode_pubkey(point, False)
    h160_c = hash160(compressed)
    h160_u = hash160(uncompressed)
    return {
        "privkey_hex": f"{privkey:064x}",
        "privkey_int": privkey,
        "network": network.name,
        "pubkey_compressed": compressed.hex(),
        "pubkey_uncompressed": uncompressed.hex(),
        "hash160_compressed": h160_c.hex(),
        "hash160_uncompressed": h160_u.hex(),
        "wif_compressed": privkey_to_wif(privkey, True, network),
        "wif_uncompressed": privkey_to_wif(privkey, False, network),
        "addresses": {
            "p2pkh_compressed": p2pkh_address(h160_c, network),
            "p2pkh_uncompressed": p2pkh_address(h160_u, network),
            "p2wpkh": p2wpkh_address(h160_c, network),
            "p2sh_p2wpkh": p2sh_p2wpkh_address(h160_c, network),
        },
    }
