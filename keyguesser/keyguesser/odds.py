"""The arithmetic that says how a brute-force search will actually go."""

from __future__ import annotations

from dataclasses import dataclass
from math import expm1, log1p
from typing import List, Tuple

from . import curve

SECONDS_PER_YEAR = 365.25 * 24 * 3600
AGE_OF_UNIVERSE_YEARS = 1.38e10

# Reference points for "how much hardware would this take".  The mining
# network figure is a generous upper bound: it can do ~10^21 SHA-256 hashes
# per second, and checking a key costs rather more than one hash.
COMPARISONS: List[Tuple[str, float]] = [
    ("a fast GPU rig (~10^9 keys/s)", 1e9),
    ("every Bitcoin miner on earth, repurposed (<=10^21 keys/s)", 1e21),
]


@dataclass
class Odds:
    keyspace: int
    targets: int
    rate: float
    duration: float

    @property
    def tries(self) -> float:
        return self.rate * self.duration

    @property
    def probability(self) -> float:
        """P(at least one hit) = 1 - (1 - t/k)^n, computed without overflow."""
        if self.keyspace <= 0 or self.targets <= 0:
            return 0.0
        p_single = min(self.targets / self.keyspace, 1.0)
        if p_single >= 1.0:
            return 1.0
        # log1p keeps the exponent meaningful when p_single is ~1e-77 and
        # (1 - p_single) would round to exactly 1.0 in double precision.
        exponent = self.tries * log1p(-p_single)
        if exponent < -700:
            return 1.0
        return -expm1(exponent)

    @property
    def expected_seconds(self) -> float:
        """Mean time to the first hit, in seconds."""
        if self.rate <= 0 or self.targets <= 0:
            return float("inf")
        return self.keyspace / self.targets / self.rate


def format_duration(seconds: float) -> str:
    if seconds != seconds or seconds == float("inf"):
        return "never"
    if seconds < 1:
        return f"{seconds * 1000:.1f} ms"
    if seconds < 90:
        return f"{seconds:.1f} s"
    if seconds < 5400:
        return f"{seconds / 60:.1f} min"
    if seconds < 172800:
        return f"{seconds / 3600:.1f} hours"
    years = seconds / SECONDS_PER_YEAR
    if years < 1:
        return f"{seconds / 86400:.1f} days"
    if years < 1e6:
        return f"{years:,.0f} years"
    universes = years / AGE_OF_UNIVERSE_YEARS
    if universes < 1:
        return f"{years:.3g} years"
    return f"{years:.3g} years ({universes:.3g}x the age of the universe)"


def format_probability(p: float) -> str:
    if p == 0:
        return "0"
    if p >= 1e-4:
        return f"{p:.6%}"
    return f"{p:.3g}  (about 1 in {1 / p:.3g})"


def summarize(keyspace: int, targets: int, rate: float, duration: float) -> str:
    odds = Odds(keyspace, targets, rate, duration)
    lines = [
        f"Keyspace searched:   {keyspace:,}  (~2^{keyspace.bit_length() - 1})",
        f"Targets:             {targets}",
        f"Search rate:         {rate:,.0f} keys/sec",
        f"Time budget:         {format_duration(duration)}",
        f"Keys examined:       {odds.tries:,.0f}",
        f"P(finding a key):    {format_probability(odds.probability)}",
        f"Expected time:       {format_duration(odds.expected_seconds)}",
    ]
    return "\n".join(lines)


def hardware_table(
    keyspace: int,
    targets: int,
    rate: float,
    label: str = "this machine (measured)",
) -> str:
    rows = []
    for name, speed in [(f"{label} ({rate:,.0f} keys/s)", rate)] + COMPARISONS:
        if speed <= 0:
            continue
        expected = Odds(keyspace, targets, speed, 0).expected_seconds
        rows.append(f"  {name:<62} {format_duration(expected)}")
    return "\n".join(rows)


def full_keyspace() -> int:
    return curve.N - 1
