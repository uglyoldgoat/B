"""Command line interface for keyguesser."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import sys
import time
from typing import List, Optional

from . import curve, odds as odds_mod
from .addresses import NETWORKS, derive
from .encoding import DecodeError, b58check_decode
from .hashing import HAVE_OPENSSL_RIPEMD160
from .search import MODES, KEYFORMS, SearchConfig, SearchReport, run_search
from .targets import UnsupportedTarget, build_targets, load_target_file

BANNER = "keyguesser"


# --- key parsing ------------------------------------------------------------

def parse_privkey(text: str, key_format: str = "auto") -> int:
    text = text.strip()
    if key_format == "passphrase":
        return int.from_bytes(hashlib.sha256(text.encode()).digest(), "big") % curve.N

    if key_format in ("auto", "wif") and text[:1] in "5KL9c":
        try:
            payload = b58check_decode(text)
        except DecodeError:
            if key_format == "wif":
                raise
        else:
            if len(payload) in (33, 34):
                return int.from_bytes(payload[1:33], "big")
            if key_format == "wif":
                raise DecodeError("WIF payload has the wrong length")

    if key_format in ("auto", "hex"):
        candidate = text[2:] if text.lower().startswith("0x") else text
        try:
            value = int(candidate, 16)
        except ValueError:
            if key_format == "hex":
                raise DecodeError(f"{text!r} is not hexadecimal")
        else:
            if key_format == "hex" or len(candidate) >= 16:
                return value

    if key_format in ("auto", "dec"):
        try:
            return int(text, 10)
        except ValueError:
            pass

    if key_format == "auto":
        try:
            return int(text, 16)
        except ValueError:
            pass

    raise DecodeError(f"could not read {text!r} as a private key")


def parse_int_arg(text: str) -> int:
    """Accept 42, 0x2a, 2**32 style shorthand, and 1_000 separators."""
    text = text.strip().replace("_", "")
    if text.lower().startswith("0x"):
        return int(text, 16)
    if "**" in text:
        base, _, exponent = text.partition("**")
        return int(base) ** int(exponent)
    if text.lower().startswith("2^"):
        return 2 ** int(text[2:])
    return int(text, 10)


# --- output helpers ---------------------------------------------------------

def print_key_report(info: dict, stream=sys.stdout) -> None:
    print(f"private key (hex)      {info['privkey_hex']}", file=stream)
    print(f"private key (dec)      {info['privkey_int']}", file=stream)
    print(f"WIF (compressed)       {info['wif_compressed']}", file=stream)
    print(f"WIF (uncompressed)     {info['wif_uncompressed']}", file=stream)
    print(f"pubkey (compressed)    {info['pubkey_compressed']}", file=stream)
    print(f"hash160 (compressed)   {info['hash160_compressed']}", file=stream)
    print(f"hash160 (uncompressed) {info['hash160_uncompressed']}", file=stream)
    print(f"network                {info['network']}", file=stream)
    print("addresses:", file=stream)
    for label, address in info["addresses"].items():
        print(f"  {label:<20} {address}", file=stream)


def make_progress_printer(config: SearchConfig, quiet: bool):
    if quiet:
        return None
    keyspace = config.keyspace
    targets = len(config.targets)
    state = {"last": 0.0}

    def progress(keys: int, elapsed: float) -> None:
        now = time.monotonic()
        if now - state["last"] < 0.4:
            return
        state["last"] = now
        rate = keys / elapsed if elapsed else 0.0
        chance = odds_mod.Odds(keyspace, targets, rate, elapsed).probability
        sys.stderr.write(
            f"\r  {keys:>16,} keys  {rate:>10,.0f}/s  "
            f"{odds_mod.format_duration(elapsed):>12}  "
            f"P(hit) {odds_mod.format_probability(chance)}        "
        )
        sys.stderr.flush()

    return progress


def finish_progress(quiet: bool) -> None:
    if not quiet:
        sys.stderr.write("\n")
        sys.stderr.flush()


def report_result(report: SearchReport, config: SearchConfig, as_json: bool) -> int:
    if as_json:
        payload = {
            "found": report.match is not None,
            "keys_tried": report.keys_tried,
            "elapsed_seconds": round(report.elapsed, 3),
            "keys_per_second": round(report.rate, 1),
            "interrupted": report.interrupted,
        }
        if report.match:
            payload["match"] = {
                "matched_targets": report.match.matched,
                "key_form": report.match.keyform,
                **report.match.details,
            }
        print(json.dumps(payload, indent=2))
        return 0 if report.match else 1

    print()
    if report.match:
        print("*** MATCH ***")
        print(f"matched target(s):     {', '.join(report.match.matched)}")
        print(f"public key form:       {report.match.keyform}")
        print_key_report(report.match.details)
    else:
        print("No match.")
        print(
            odds_mod.summarize(
                config.keyspace, len(config.targets), report.rate, report.elapsed
            )
        )
        print("\nExpected time to a hit at various speeds:")
        print(odds_mod.hardware_table(config.keyspace, len(config.targets), report.rate))
    print(
        f"\n{report.keys_tried:,} keys in {odds_mod.format_duration(report.elapsed)}"
        f" ({report.rate:,.0f} keys/sec)"
        + (" [interrupted]" if report.interrupted else "")
    )
    return 0 if report.match else 1


# --- subcommands ------------------------------------------------------------

def cmd_derive(args: argparse.Namespace) -> int:
    privkey = parse_privkey(args.key, args.format)
    if not 1 <= privkey < curve.N:
        print("private key is out of range for secp256k1", file=sys.stderr)
        return 2
    info = derive(privkey, NETWORKS[args.network])
    if args.json:
        print(json.dumps(info, indent=2))
    else:
        print_key_report(info)
    return 0


def _collect_targets(args: argparse.Namespace) -> List[str]:
    addresses: List[str] = list(args.target or [])
    for path in args.targets_file or []:
        addresses.extend(load_target_file(path))
    return addresses


def cmd_search(args: argparse.Namespace) -> int:
    addresses = _collect_targets(args)
    if not addresses:
        print("give at least one --target or --targets-file", file=sys.stderr)
        return 2
    try:
        targets = build_targets(addresses, args.network, skip_unsupported=args.skip_unsupported)
    except (DecodeError, UnsupportedTarget) as exc:
        print(f"target error: {exc}", file=sys.stderr)
        return 2
    for skipped in targets.skipped:
        print(f"skipping unsupported target: {skipped}", file=sys.stderr)
    if len(targets) == 0:
        print("no usable targets left", file=sys.stderr)
        return 2

    config = SearchConfig(
        targets=targets,
        mode=args.mode,
        start=parse_int_arg(args.start),
        end=parse_int_arg(args.end) if args.end else curve.N - 1,
        keyforms=args.keyforms,
        workers=args.workers,
        walk_length=args.walk_length,
        max_keys=parse_int_arg(args.max_keys) if args.max_keys else None,
        time_limit=args.time_limit,
        network=NETWORKS[args.network],
        seed=args.seed,
    )
    try:
        config.validate()
    except ValueError as exc:
        print(f"bad search configuration: {exc}", file=sys.stderr)
        return 2

    verbose = not (args.quiet or args.json)
    if verbose:
        print(f"targets:   {targets.describe()}")
        print(f"mode:      {config.mode}  ({config.workers} worker(s), {config.keyforms} keys)")
        print(f"keyspace:  {config.keyspace:,}  (~2^{config.keyspace.bit_length() - 1})")
        if config.mode == "sequential":
            print(f"range:     {config.start:#x} .. {config.end:#x}")
        print()

    report = run_search(config, progress=make_progress_printer(config, not verbose))
    finish_progress(not verbose)
    return report_result(report, config, args.json)


def cmd_demo(args: argparse.Namespace) -> int:
    """Prove the pipeline works by solving a deliberately tiny keyspace."""
    bits = args.bits
    if not 1 <= bits <= 40:
        print("--bits must be between 1 and 40 to finish this decade", file=sys.stderr)
        return 2
    upper = 1 << bits
    secret_key = secrets.randbelow(upper - 1) + 1
    info = derive(secret_key, NETWORKS[args.network])
    address = info["addresses"]["p2pkh_compressed"]

    verbose = not (args.quiet or args.json)
    if verbose:
        print(f"Generated a random key in [1, 2^{bits}) and threw the key away.")
        print(f"Target address: {address}")
        print(f"Keyspace:       {upper:,} candidates\n")

    targets = build_targets([address], args.network)
    config = SearchConfig(
        targets=targets,
        mode="sequential",
        start=1,
        end=upper,
        keyforms="compressed",
        workers=args.workers,
        network=NETWORKS[args.network],
    )
    report = run_search(config, progress=make_progress_printer(config, not verbose))
    finish_progress(not verbose)
    rc = report_result(report, config, args.json)
    if report.match and report.match.privkey != secret_key:
        print("WARNING: recovered a different key than the one generated", file=sys.stderr)
        return 1
    if report.match and verbose:
        full = curve.N - 1
        ratio = full / upper
        print(
            f"\nThat took {report.keys_tried:,} keys over a 2^{bits} space. "
            f"A real Bitcoin key lives in a space {ratio:.3g}x larger:"
        )
        print(
            "  expected time at this machine's rate: "
            f"{odds_mod.format_duration(odds_mod.Odds(full, 1, report.rate, 0).expected_seconds)}"
        )
    return rc


def cmd_odds(args: argparse.Namespace) -> int:
    keyspace = parse_int_arg(args.keyspace) if args.keyspace else curve.N - 1
    rate = args.rate
    if rate is None:
        rate = benchmark(args.benchmark_seconds)
        print(f"measured rate: {rate:,.0f} keys/sec on this machine\n")
    duration = args.years * odds_mod.SECONDS_PER_YEAR if args.years else args.seconds
    print(odds_mod.summarize(keyspace, args.targets, rate, duration))
    print("\nExpected time to a hit at various speeds:")
    label = "the rate you gave" if args.rate is not None else "this machine (measured)"
    print(odds_mod.hardware_table(keyspace, args.targets, rate, label))
    return 0


def benchmark(seconds: float, workers: int = 1) -> float:
    """Measure candidate throughput against a target that cannot be hit."""
    targets = build_targets(["hash160:" + "00" * 20])
    config = SearchConfig(
        targets=targets,
        mode="sequential",
        start=secrets.randbelow(1 << 128) + 1,
        end=curve.N - 1,
        workers=workers,
        time_limit=seconds,
    )
    report = run_search(config)
    return report.rate


def cmd_benchmark(args: argparse.Namespace) -> int:
    rate = benchmark(args.seconds, args.workers)
    ripemd = "openssl" if HAVE_OPENSSL_RIPEMD160 else "pure-python fallback"
    print(f"{rate:,.0f} keys/sec with {args.workers} worker(s)  [ripemd160: {ripemd}]")
    print(
        "\nFull-keyspace expectation: "
        + odds_mod.format_duration(odds_mod.Odds(curve.N - 1, 1, rate, 0).expected_seconds)
    )
    return 0


def cmd_selftest(args: argparse.Namespace) -> int:
    from .selftest import run_selftest

    return run_selftest(verbose=not args.quiet)


# --- argument parsing -------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="keyguesser",
        description=(
            "Search secp256k1 private keys for ones matching a Bitcoin address, "
            "and show exactly how hopeless that is at full scale."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    common_net = argparse.ArgumentParser(add_help=False)
    common_net.add_argument(
        "--network", choices=sorted(NETWORKS), default="mainnet", help="address network"
    )
    common_net.add_argument("--json", action="store_true", help="machine-readable output")
    common_net.add_argument("--quiet", "-q", action="store_true", help="suppress progress output")

    p_derive = sub.add_parser(
        "derive", parents=[common_net], help="show the addresses a private key produces"
    )
    p_derive.add_argument("key", help="private key as hex, decimal, WIF, or passphrase")
    p_derive.add_argument(
        "--format",
        choices=("auto", "hex", "dec", "wif", "passphrase"),
        default="auto",
        help="how to read the key argument (passphrase = sha256 of the text)",
    )
    p_derive.set_defaults(func=cmd_derive)

    p_search = sub.add_parser(
        "search", parents=[common_net], help="hunt for a private key matching an address"
    )
    p_search.add_argument("--target", "-t", action="append", help="address to search for (repeatable)")
    p_search.add_argument(
        "--targets-file", "-f", action="append", help="file with one address per line"
    )
    p_search.add_argument("--mode", choices=MODES, default="random-walk")
    p_search.add_argument("--start", default="1", help="range start (hex, decimal, or 2**k)")
    p_search.add_argument("--end", default=None, help="range end, inclusive")
    p_search.add_argument("--keyforms", choices=KEYFORMS, default="compressed")
    p_search.add_argument("--workers", "-w", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    p_search.add_argument(
        "--walk-length", type=int, default=1 << 16, help="keys per random-walk segment"
    )
    p_search.add_argument("--max-keys", default=None, help="stop after this many candidates")
    p_search.add_argument("--time-limit", type=float, default=None, help="stop after N seconds")
    p_search.add_argument("--seed", type=int, default=None, help="deterministic RNG seed")
    p_search.add_argument(
        "--skip-unsupported", action="store_true", help="ignore targets that cannot be searched"
    )
    p_search.set_defaults(func=cmd_search)

    p_demo = sub.add_parser(
        "demo", parents=[common_net], help="solve a tiny keyspace end to end to prove it works"
    )
    p_demo.add_argument("--bits", type=int, default=20, help="size of the toy keyspace")
    p_demo.add_argument("--workers", "-w", type=int, default=1)
    p_demo.set_defaults(func=cmd_demo)

    p_odds = sub.add_parser("odds", help="probability and expected time for a search")
    p_odds.add_argument("--keyspace", default=None, help="candidates to draw from (default: 2^256)")
    p_odds.add_argument("--targets", type=int, default=1, help="how many addresses you accept")
    p_odds.add_argument("--rate", type=float, default=None, help="keys/sec (default: measure)")
    p_odds.add_argument("--seconds", type=float, default=odds_mod.SECONDS_PER_YEAR)
    p_odds.add_argument("--years", type=float, default=None)
    p_odds.add_argument("--benchmark-seconds", type=float, default=2.0)
    p_odds.set_defaults(func=cmd_odds)

    p_bench = sub.add_parser("benchmark", help="measure candidates per second")
    p_bench.add_argument("--seconds", type=float, default=3.0)
    p_bench.add_argument("--workers", "-w", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    p_bench.set_defaults(func=cmd_benchmark)

    p_self = sub.add_parser("selftest", help="check the crypto against known test vectors")
    p_self.add_argument("--quiet", "-q", action="store_true")
    p_self.set_defaults(func=cmd_selftest)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        return 130
    except (DecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
