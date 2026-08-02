"""Tests for target parsing, the search loop, and the odds arithmetic."""

import pytest

from keyguesser import curve
from keyguesser.addresses import TESTNET, derive
from keyguesser.cli import main, parse_int_arg, parse_privkey
from keyguesser.encoding import DecodeError
from keyguesser.odds import Odds, format_duration, format_probability
from keyguesser.search import SearchConfig, run_search
from keyguesser.targets import UnsupportedTarget, build_targets, classify

SECRET = 987654
P2PKH = derive(SECRET)["addresses"]["p2pkh_compressed"]
P2WPKH = derive(SECRET)["addresses"]["p2wpkh"]
P2SH = derive(SECRET)["addresses"]["p2sh_p2wpkh"]


def make_config(**kwargs) -> SearchConfig:
    defaults = dict(
        targets=build_targets([P2PKH]),
        mode="sequential",
        start=SECRET - 500,
        end=SECRET + 500,
        workers=1,
    )
    defaults.update(kwargs)
    return SearchConfig(**defaults)


# --- targets ---------------------------------------------------------------

def test_classify_supported_kinds():
    assert classify(P2PKH)[0] == "p2pkh"
    assert classify(P2WPKH)[0] == "p2wpkh"
    assert classify(P2SH)[0] == "p2sh-p2wpkh"


def test_p2pkh_and_p2wpkh_share_a_key_hash():
    targets = build_targets([P2PKH, P2WPKH])
    assert len(targets.keyhashes) == 1
    assert len(targets) == 1


def test_taproot_is_rejected():
    taproot = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr"
    with pytest.raises(UnsupportedTarget):
        build_targets([taproot])
    skipped = build_targets([P2PKH, taproot], skip_unsupported=True)
    assert skipped.skipped == [taproot]
    assert len(skipped) == 1


def test_wrong_network_target_is_rejected():
    testnet = derive(SECRET, TESTNET)["addresses"]["p2wpkh"]
    with pytest.raises((UnsupportedTarget, DecodeError)):
        build_targets([testnet], "mainnet")


def test_raw_hash160_target():
    digest = derive(SECRET)["hash160_compressed"]
    targets = build_targets([f"hash160:{digest}"])
    assert bytes.fromhex(digest) in targets.keyhashes


# --- search ----------------------------------------------------------------

def test_sequential_search_finds_planted_key():
    report = run_search(make_config())
    assert report.match is not None
    assert report.match.privkey == SECRET
    assert report.match.matched == [P2PKH]
    assert report.match.details["addresses"]["p2pkh_compressed"] == P2PKH


def test_sequential_search_across_workers():
    report = run_search(make_config(workers=3, start=SECRET - 5000, end=SECRET + 5000))
    assert report.match is not None
    assert report.match.privkey == SECRET


def test_search_matches_uncompressed_form_only_when_asked():
    address = derive(SECRET)["addresses"]["p2pkh_uncompressed"]
    config = make_config(targets=build_targets([address]))
    assert run_search(config).match is None

    config = make_config(targets=build_targets([address]), keyforms="both")
    match = run_search(config).match
    assert match is not None and match.keyform == "uncompressed"


def test_search_matches_nested_segwit():
    config = make_config(targets=build_targets([P2SH]))
    match = run_search(config).match
    assert match is not None
    assert match.keyform == "p2sh-p2wpkh"
    assert match.privkey == SECRET


def test_search_reports_no_match_and_counts_keys():
    config = make_config(start=1, end=2000, max_keys=2000)
    report = run_search(config)
    assert report.match is None
    assert report.keys_tried > 0


def test_max_keys_is_respected():
    config = make_config(mode="random-walk", start=1, end=curve.N - 1, max_keys=3000)
    report = run_search(config)
    assert report.match is None
    assert report.keys_tried <= 3100  # counter granularity


def test_random_mode_finds_a_key_in_a_tiny_range():
    # A 1001-key range is small enough that independent random draws land on
    # the planted key quickly, which exercises the full scalar-multiply path.
    config = make_config(mode="random", max_keys=200_000, seed=7)
    match = run_search(config).match
    assert match is not None and match.privkey == SECRET


def test_random_walk_finds_a_key_in_a_tiny_range():
    config = make_config(mode="random-walk", walk_length=64, max_keys=200_000, seed=11)
    match = run_search(config).match
    assert match is not None and match.privkey == SECRET


def test_invalid_configurations_are_rejected():
    with pytest.raises(ValueError):
        run_search(make_config(mode="nonsense"))
    with pytest.raises(ValueError):
        run_search(make_config(start=10, end=5))
    with pytest.raises(ValueError):
        run_search(make_config(targets=build_targets([])))


# --- odds ------------------------------------------------------------------

def test_probability_survives_astronomically_small_p():
    odds = Odds(keyspace=curve.N - 1, targets=1, rate=1e9, duration=3.15e10)
    assert 0 < odds.probability < 1e-50


def test_probability_saturates_on_a_tiny_keyspace():
    odds = Odds(keyspace=1000, targets=1, rate=1000, duration=1000)
    assert odds.probability > 0.999


def test_expected_time_scales_with_targets():
    one = Odds(2**40, 1, 1e6, 0).expected_seconds
    ten = Odds(2**40, 10, 1e6, 0).expected_seconds
    assert one == pytest.approx(ten * 10)


def test_duration_formatting():
    assert format_duration(0.5).endswith("ms")
    assert "years" in format_duration(1e18)
    assert "universe" in format_duration(1e40)
    assert format_duration(float("inf")) == "never"


def test_probability_formatting():
    assert format_probability(0) == "0"
    assert "1 in" in format_probability(1e-30)


# --- cli -------------------------------------------------------------------

@pytest.mark.parametrize(
    "text,key_format,expected",
    [
        ("1", "dec", 1),
        ("0x2a", "hex", 42),
        ("0000000000000000000000000000000000000000000000000000000000000001", "auto", 1),
        ("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn", "wif", 1),
        ("5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf", "auto", 1),
    ],
)
def test_parse_privkey(text, key_format, expected):
    assert parse_privkey(text, key_format) == expected


def test_parse_privkey_passphrase_is_sha256():
    import hashlib

    expected = int.from_bytes(hashlib.sha256(b"correct horse").digest(), "big")
    assert parse_privkey("correct horse", "passphrase") == expected


def test_parse_int_arg_shorthand():
    assert parse_int_arg("2**20") == 1 << 20
    assert parse_int_arg("2^20") == 1 << 20
    assert parse_int_arg("0xff") == 255
    assert parse_int_arg("1_000") == 1000


def test_cli_derive_and_search_round_trip(capsys):
    assert main(["derive", str(SECRET), "--json"]) == 0
    payload = capsys.readouterr().out
    assert P2PKH in payload

    rc = main(
        [
            "search",
            "-t", P2PKH,
            "--mode", "sequential",
            "--start", str(SECRET - 200),
            "--end", str(SECRET + 200),
            "-w", "1",
            "--json",
            "--quiet",
        ]
    )
    assert rc == 0
    assert '"found": true' in capsys.readouterr().out


def test_cli_search_without_targets_errors():
    assert main(["search", "--quiet"]) == 2


def test_cli_selftest_passes():
    assert main(["selftest", "-q"]) == 0
