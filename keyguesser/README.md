# keyguesser

A working Bitcoin private key search tool — and an honest measurement of why
that phrase is a joke at full scale.

It does the real thing: generates candidate secp256k1 private keys, derives
the public keys and addresses, and compares them against whatever addresses
you give it. It also tells you, continuously, what your odds are. On a modern
laptop those odds are roughly the odds of picking one specific atom out of
the observable universe, twice.

Pure Python, no dependencies.

## Install

```bash
cd keyguesser
pip install -e .          # provides the `keyguesser` command
# or just run it in place:
python -m keyguesser --help
```

Verify the crypto against published test vectors before trusting any output:

```bash
keyguesser selftest
```

## Use it

### See what a key produces

```bash
$ keyguesser derive 1
private key (hex)      0000000000000000000000000000000000000000000000000000000000000001
WIF (compressed)       KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn
hash160 (compressed)   751e76e8199196d454941c45d1b3a323f1433bd6
addresses:
  p2pkh_compressed     1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH
  p2pkh_uncompressed   1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm
  p2wpkh               bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4
  p2sh_p2wpkh          3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN
```

Accepts hex, decimal, WIF, or `--format passphrase` (SHA-256 of the text — the
"brainwallet" construction, which is exactly why brainwallets get emptied).

### Prove the search actually works

`demo` mints a random key inside a deliberately tiny keyspace, discards it,
hands the search only the address, and recovers the key:

```bash
$ keyguesser demo --bits 20 -w 4
Generated a random key in [1, 2^20) and threw the key away.
Target address: 1LPphgCcjkvH7oZby1vtW8h2hsDpY33k1X
Keyspace:       1,048,576 candidates

*** MATCH ***
private key (dec)      21676
...
That took 83,456 keys over a 2^20 space. A real Bitcoin key lives in a space
1.1e+71x larger.
```

Same machinery, same code path as a real search. The only thing that changed
is the size of the haystack.

### Search for a real address

```bash
keyguesser search -t 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH --time-limit 30
```

```
keyguesser search \
  --targets-file addresses.txt \
  --mode sequential \
  --start 2**71 --end 2**72 \
  --workers 8
```

Options that matter:

| flag | what it does |
| --- | --- |
| `--mode sequential` | walk a contiguous range; the only mode that can ever *finish* |
| `--mode random-walk` | random start, short sequential run, jump again (default, fastest per key) |
| `--mode random` | an independent random key each time; statistically pure, ~40x slower |
| `--start / --end` | range bounds; accepts `0x…`, `2**71`, `1_000_000` |
| `--keyforms` | `compressed` (default), `uncompressed`, or `both` — `both` doubles the work |
| `--workers N` | one process per core |
| `--max-keys` / `--time-limit` | stop conditions |
| `--json` | machine-readable result; exit code 0 on a hit, 1 on no hit |

Targets can be P2PKH (`1…`), P2WPKH (`bc1q…`), nested SegWit P2SH-P2WPKH
(`3…`), or a raw `hash160:<40 hex chars>`. Taproot (`bc1p…`) and P2WSH are
rejected with an explanation rather than silently never matching.

### The arithmetic, without running anything

```bash
$ keyguesser odds --rate 1e21 --years 1e9
Keyspace searched:   115,792,089,237,316,195,423,570,985,008,687,907,852,837,564,279,074,904,382,605,163,141,518,161,494,336
Targets:             1
Search rate:         1,000,000,000,000,000,000,000 keys/sec
Keys examined:       31,557,600,000,000,000,000,000,000,000,000,000,000
P(finding a key):    2.73e-40  (about 1 in 3.67e+39)
```

A billion years of the entire Bitcoin mining network, converted to key search,
gets you to one chance in 10^39.

## What the numbers look like

Measured on 4 cores of the machine this was written on:

| | keys/sec |
| --- | --- |
| 1 worker | ~63,000 |
| 4 workers | ~242,000 |

Expected time to find one specific key:

| hardware | expected time |
| --- | --- |
| this machine, 4 cores | 1.5 × 10^64 years |
| a fast GPU rig (10^9 keys/s) | 3.7 × 10^60 years |
| every Bitcoin miner on earth (≤10^21 keys/s) | 3.7 × 10^48 years |

The universe is 1.4 × 10^10 years old. Even the last row is off by 38 orders
of magnitude, and that row assumes hardware that does not exist, doing a job
it was not built for, running for longer than the heat death.

There is no clever flag in this tool that changes those numbers. The keyspace
is 2^256 ≈ 1.16 × 10^77, and nothing about a 256-bit ECDSA key is weak enough
to shortcut. Searching is genuinely the best known approach, which is the
whole point of the design.

Where key loss *does* happen in practice, it is never brute force: it is weak
key generation (brainwallets, broken RNGs, `2^32`-seeded wallets), reused
ECDSA nonces, or leaked backups. This tool will happily find a key in any
range you can name — so if you know your key was in `[2^71, 2^72)`, a range
search is real. That is what `--start/--end` is for.

## How it works

```
keyguesser/
  curve.py       secp256k1: comb-table scalar multiply, Jacobian arithmetic,
                 batch affine conversion
  hashing.py     SHA-256, RIPEMD-160 (OpenSSL when present, pure Python otherwise)
  encoding.py    base58check, bech32/bech32m
  addresses.py   private key -> pubkey -> hash160 -> address / WIF
  targets.py     addresses decoded to raw hashes for cheap comparison
  search.py      the candidate loops and multiprocess driver
  odds.py        probability and expected-time arithmetic
  selftest.py    known-answer tests, runnable without pytest
  cli.py         argparse front end
```

Three things carry the performance:

1. **Targets are decoded once.** Addresses collapse to 20-byte hashes up
   front, so the inner loop compares `bytes` against a dict instead of
   base58-encoding every candidate.
2. **Sequential candidates use point addition, not multiplication.** Walking
   `k → k+1` is one mixed Jacobian addition (~7 µs) instead of a fresh scalar
   multiply (~470 µs).
3. **Affine conversion is batched.** A modular inverse costs ~158 µs, which
   dwarfed everything else; Montgomery's trick converts 256 points with one
   inversion and brings the amortised cost to ~0.6 µs. That single change was
   worth 11.6x.

A C or GPU implementation would beat this by 3–4 orders of magnitude. It would
also still need 10^60 years.

## Tests

```bash
pip install -e ".[dev]"
pytest              # 50 tests
keyguesser selftest # same vectors, no test framework needed
```

The suite pins published vectors: RIPEMD-160 from the reference spec,
private key 1 through to its four address forms, BIP-173 bech32 round trips,
and end-to-end recovery of planted keys in every search mode.

## Scope

Only key-search is implemented. There is no wallet, no signing, no network
code, and no transaction construction — recovering a key here gets you a
number on stdout, nothing else. Use it on addresses you own or on toy
keyspaces you generate yourself.

MIT licensed.
