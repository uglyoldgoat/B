"""Parsing target addresses into the byte strings a search loop compares."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Sequence, Tuple

from .addresses import MAINNET, NETWORKS, Network
from .encoding import DecodeError, b58check_decode, bech32_decode

# Address kinds that reduce to a hash of the public key itself.
KEYHASH_KINDS = ("p2pkh", "p2wpkh")
# Address kinds that reduce to a hash of a script wrapping the key hash.
SCRIPTHASH_KINDS = ("p2sh-p2wpkh",)


class UnsupportedTarget(ValueError):
    """Raised for addresses this tool cannot search for."""


def classify(address: str, network: Network = MAINNET) -> Tuple[str, bytes]:
    """Return (kind, 20-byte hash) for a supported address string."""
    text = address.strip()
    if not text:
        raise DecodeError("empty address")

    if text.lower().startswith(network.hrp + "1"):
        hrp, version, program = bech32_decode(text)
        if hrp != network.hrp:
            raise UnsupportedTarget(f"{text}: wrong network prefix {hrp!r}")
        if version == 0 and len(program) == 20:
            return "p2wpkh", program
        if version == 0:
            raise UnsupportedTarget(
                f"{text}: P2WSH pays to a script hash, not to a single key"
            )
        raise UnsupportedTarget(
            f"{text}: witness v{version} (e.g. taproot) is not supported"
        )

    payload = b58check_decode(text)
    if len(payload) != 21:
        raise DecodeError(f"{text}: unexpected base58check payload length")
    version, digest = payload[0], payload[1:]
    if version == network.p2pkh_version:
        return "p2pkh", digest
    if version == network.p2sh_version:
        # Could wrap any script; we can only search the nested-P2WPKH case.
        return "p2sh-p2wpkh", digest
    raise UnsupportedTarget(f"{text}: unknown address version byte 0x{version:02x}")


@dataclass
class TargetSet:
    """Targets pre-decoded into hash sets for cheap per-candidate lookup."""

    network: Network = MAINNET
    keyhashes: Dict[bytes, List[str]] = field(default_factory=dict)
    scripthashes: Dict[bytes, List[str]] = field(default_factory=dict)
    skipped: List[str] = field(default_factory=list)

    def add(self, address: str) -> None:
        text = address.strip()
        if not text or text.startswith("#"):
            return
        if text.lower().startswith("hash160:"):
            digest = bytes.fromhex(text.split(":", 1)[1])
            if len(digest) != 20:
                raise DecodeError(f"{text}: hash160 must be 20 bytes")
            self.keyhashes.setdefault(digest, []).append(text)
            return
        kind, digest = classify(text, self.network)
        bucket = self.scripthashes if kind in SCRIPTHASH_KINDS else self.keyhashes
        bucket.setdefault(digest, []).append(text)

    def add_all(self, addresses: Iterable[str]) -> None:
        for address in addresses:
            self.add(address)

    @property
    def needs_script_hash(self) -> bool:
        return bool(self.scripthashes)

    def __len__(self) -> int:
        return len(self.keyhashes) + len(self.scripthashes)

    def describe(self) -> str:
        parts = []
        if self.keyhashes:
            parts.append(f"{len(self.keyhashes)} key-hash")
        if self.scripthashes:
            parts.append(f"{len(self.scripthashes)} script-hash")
        return ", ".join(parts) or "none"

    def lookup(self, digest: bytes, script: bool = False) -> List[str]:
        table = self.scripthashes if script else self.keyhashes
        return table.get(digest, [])


def build_targets(
    addresses: Sequence[str],
    network_name: str = "mainnet",
    skip_unsupported: bool = False,
) -> TargetSet:
    targets = TargetSet(network=NETWORKS[network_name])
    for address in addresses:
        try:
            targets.add(address)
        except UnsupportedTarget:
            if not skip_unsupported:
                raise
            targets.skipped.append(address.strip())
    return targets


def load_target_file(path: str) -> List[str]:
    lines: List[str] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.split("#", 1)[0].strip()
            if line:
                lines.append(line)
    return lines
