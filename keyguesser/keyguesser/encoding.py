"""Base58Check and Bech32/Bech32m encoding."""

from __future__ import annotations

from typing import Iterable, List, Optional, Tuple

from .hashing import double_sha256

B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B58_INDEX = {char: value for value, char in enumerate(B58_ALPHABET)}


class DecodeError(ValueError):
    """Raised when a string is not a well-formed address or key encoding."""


def b58encode(data: bytes) -> str:
    number = int.from_bytes(data, "big")
    out: List[str] = []
    while number:
        number, rem = divmod(number, 58)
        out.append(B58_ALPHABET[rem])
    for byte in data:
        if byte:
            break
        out.append(B58_ALPHABET[0])
    return "".join(reversed(out))


def b58decode(text: str) -> bytes:
    number = 0
    for char in text:
        value = _B58_INDEX.get(char)
        if value is None:
            raise DecodeError(f"invalid base58 character {char!r}")
        number = number * 58 + value
    body = number.to_bytes((number.bit_length() + 7) // 8, "big")
    pad = len(text) - len(text.lstrip(B58_ALPHABET[0]))
    return b"\x00" * pad + body


def b58check_encode(payload: bytes) -> str:
    return b58encode(payload + double_sha256(payload)[:4])


def b58check_decode(text: str) -> bytes:
    raw = b58decode(text)
    if len(raw) < 5:
        raise DecodeError("base58check string is too short")
    payload, checksum = raw[:-4], raw[-4:]
    if double_sha256(payload)[:4] != checksum:
        raise DecodeError("base58check checksum mismatch")
    return payload


# --- bech32 / bech32m (BIP-173, BIP-350) ------------------------------------

BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
BECH32_CONST = 1
BECH32M_CONST = 0x2BC830A3


def _polymod(values: Iterable[int]) -> int:
    generator = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    chk = 1
    for value in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ value
        for i in range(5):
            if (top >> i) & 1:
                chk ^= generator[i]
    return chk


def _hrp_expand(hrp: str) -> List[int]:
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]


def _convertbits(data: Iterable[int], frombits: int, tobits: int, pad: bool) -> Optional[List[int]]:
    acc = 0
    bits = 0
    out: List[int] = []
    maxv = (1 << tobits) - 1
    max_acc = (1 << (frombits + tobits - 1)) - 1
    for value in data:
        if value < 0 or (value >> frombits):
            return None
        acc = ((acc << frombits) | value) & max_acc
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            out.append((acc >> bits) & maxv)
    if pad:
        if bits:
            out.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    return out


def bech32_encode(hrp: str, witness_version: int, witness_program: bytes) -> str:
    data = [witness_version] + (_convertbits(witness_program, 8, 5, True) or [])
    const = BECH32_CONST if witness_version == 0 else BECH32M_CONST
    checksum_input = _hrp_expand(hrp) + data + [0, 0, 0, 0, 0, 0]
    polymod = _polymod(checksum_input) ^ const
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + "1" + "".join(BECH32_CHARSET[d] for d in data + checksum)


def bech32_decode(address: str) -> Tuple[str, int, bytes]:
    """Return (hrp, witness_version, witness_program)."""
    if address != address.lower() and address != address.upper():
        raise DecodeError("mixed-case bech32 string")
    address = address.lower()
    pos = address.rfind("1")
    if pos < 1 or pos + 7 > len(address) or len(address) > 90:
        raise DecodeError("malformed bech32 string")
    hrp, payload = address[:pos], address[pos + 1:]
    try:
        data = [BECH32_CHARSET.index(c) for c in payload]
    except ValueError as exc:
        raise DecodeError("invalid bech32 character") from exc
    const = _polymod(_hrp_expand(hrp) + data)
    version = data[0]
    if version == 0:
        if const != BECH32_CONST:
            raise DecodeError("bad bech32 checksum")
    elif const != BECH32M_CONST:
        raise DecodeError("bad bech32m checksum")
    program = _convertbits(data[1:-6], 5, 8, False)
    if program is None or not 2 <= len(program) <= 40:
        raise DecodeError("invalid witness program")
    if version == 0 and len(program) not in (20, 32):
        raise DecodeError("invalid v0 witness program length")
    if version > 16:
        raise DecodeError("invalid witness version")
    return hrp, version, bytes(program)
