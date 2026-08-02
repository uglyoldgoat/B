"""The search engine: turn candidate private keys into hashes and compare.

Three ways to pick candidates:

``sequential``   walk a contiguous key range, lowest to highest.
``random-walk``  jump to a random key, walk a short stretch, jump again.
``random``       an independent random key every time (statistically pure,
                 but each candidate costs a full scalar multiplication).

Only ``sequential`` over a *small* declared range has any chance of
finishing.  See ``keyguesser odds`` for what the other two are up against.
"""

from __future__ import annotations

import multiprocessing as mp
import os
import queue
import secrets
import time
from dataclasses import dataclass, field
from typing import Iterator, List, Optional, Sequence, Tuple

from . import curve
from .addresses import MAINNET, Network, derive, encode_pubkey, p2wpkh_redeem_script
from .hashing import hash160
from .targets import TargetSet

MODES = ("sequential", "random-walk", "random")
KEYFORMS = ("compressed", "uncompressed", "both")

# How many candidates a worker processes between shared-counter updates.
COUNTER_BATCH = 512


@dataclass
class SearchConfig:
    targets: TargetSet
    mode: str = "random-walk"
    start: int = 1
    end: int = curve.N - 1
    keyforms: str = "compressed"
    workers: int = 1
    walk_length: int = 1 << 16
    max_keys: Optional[int] = None
    time_limit: Optional[float] = None
    network: Network = MAINNET
    seed: Optional[int] = None

    def validate(self) -> None:
        if self.mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}")
        if self.keyforms not in KEYFORMS:
            raise ValueError(f"keyforms must be one of {KEYFORMS}")
        if not 1 <= self.start <= self.end < curve.N:
            raise ValueError("range must satisfy 1 <= start <= end < N")
        if self.workers < 1:
            raise ValueError("need at least one worker")
        if len(self.targets) == 0:
            raise ValueError("no targets to search for")

    @property
    def keyspace(self) -> int:
        if self.mode == "sequential":
            return self.end - self.start + 1
        return curve.N - 1


@dataclass
class Match:
    privkey: int
    matched: List[str]
    keyform: str
    details: dict = field(default_factory=dict)


def _candidates(config: SearchConfig, worker_id: int) -> Iterator[Tuple[int, Tuple[int, int]]]:
    """Yield (privkey, point) pairs for this worker to test."""
    if config.mode == "sequential":
        span = config.end - config.start + 1
        chunk, extra = divmod(span, config.workers)
        lo = config.start + worker_id * chunk + min(worker_id, extra)
        count = chunk + (1 if worker_id < extra else 0)
        if count <= 0:
            return
        yield from curve.walk_from(lo, count)
        return

    rng = secrets.SystemRandom()
    if config.seed is not None:
        import random

        rng = random.Random(config.seed + worker_id)

    span = config.end - config.start + 1
    if config.mode == "random":
        while True:
            scalars = [config.start + rng.randrange(span) for _ in range(curve.DEFAULT_BATCH)]
            yield from zip(scalars, curve.mul_g_many(scalars))
    else:  # random-walk
        while True:
            k = config.start + rng.randrange(span)
            length = min(config.walk_length, config.end - k + 1)
            yield from curve.walk_from(k, max(length, 1))


def _scan(
    config: SearchConfig,
    worker_id: int,
    on_progress=None,
    should_stop=None,
) -> Optional[Match]:
    """Core loop.  Shared by the single-process and multiprocess paths."""
    targets = config.targets
    keyhashes = targets.keyhashes
    scripthashes = targets.scripthashes
    want_script = bool(scripthashes)
    do_compressed = config.keyforms in ("compressed", "both")
    do_uncompressed = config.keyforms in ("uncompressed", "both")

    processed = 0
    deadline = time.monotonic() + config.time_limit if config.time_limit else None
    budget = config.max_keys

    def hit(privkey: int, hits, keyform: str) -> Match:
        # Flush the keys counted since the last batch so a fast match still
        # reports an honest total.
        if on_progress is not None:
            on_progress(processed % COUNTER_BATCH + 1)
        return _make_match(privkey, hits, keyform, config)

    for privkey, point in _candidates(config, worker_id):
        x, y = point
        if do_compressed:
            pub = bytes([2 + (y & 1)]) + x.to_bytes(32, "big")
            digest = hash160(pub)
            hits = keyhashes.get(digest)
            if hits:
                return hit(privkey, hits, "compressed")
            if want_script:
                script_digest = hash160(p2wpkh_redeem_script(digest))
                hits = scripthashes.get(script_digest)
                if hits:
                    return hit(privkey, hits, "p2sh-p2wpkh")
        if do_uncompressed:
            pub = b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")
            hits = keyhashes.get(hash160(pub))
            if hits:
                return hit(privkey, hits, "uncompressed")

        processed += 1
        if processed % COUNTER_BATCH == 0:
            if on_progress is not None:
                on_progress(COUNTER_BATCH)
            if should_stop is not None and should_stop():
                return None
            if deadline is not None and time.monotonic() >= deadline:
                return None
        if budget is not None and processed >= budget:
            break

    if on_progress is not None:
        on_progress(processed % COUNTER_BATCH)
    return None


def _make_match(privkey: int, hits: Sequence[str], keyform: str, config: SearchConfig) -> Match:
    return Match(
        privkey=privkey,
        matched=list(hits),
        keyform=keyform,
        details=derive(privkey, config.network),
    )


def _worker_entry(config: SearchConfig, worker_id: int, counters, result_q, stop_event) -> None:
    try:
        def bump(n: int) -> None:
            if n:
                counters[worker_id] += n

        match = _scan(config, worker_id, on_progress=bump, should_stop=stop_event.is_set)
        if match is not None:
            result_q.put(match)
            stop_event.set()
    except KeyboardInterrupt:  # pragma: no cover - signal handling
        pass
    finally:
        result_q.put(None)


@dataclass
class SearchReport:
    match: Optional[Match]
    keys_tried: int
    elapsed: float
    interrupted: bool = False

    @property
    def rate(self) -> float:
        return self.keys_tried / self.elapsed if self.elapsed > 0 else 0.0


def run_search(config: SearchConfig, progress=None) -> SearchReport:
    """Run a search across `config.workers` processes.

    `progress` is called as progress(keys_tried, elapsed) roughly twice a
    second so a caller can render a status line.
    """
    config.validate()
    started = time.monotonic()

    if config.workers == 1:
        return _run_single(config, progress, started)

    ctx = mp.get_context("spawn" if os.name == "nt" else "fork")
    counters = ctx.Array("q", config.workers, lock=False)
    result_q: "mp.Queue" = ctx.Queue()
    stop_event = ctx.Event()

    # Per-worker budgets so --max-keys means the same thing at any width.
    sub = SearchConfig(**{**config.__dict__})
    if config.max_keys is not None:
        sub.max_keys = max(1, config.max_keys // config.workers)

    procs = [
        ctx.Process(target=_worker_entry, args=(sub, wid, counters, result_q, stop_event), daemon=True)
        for wid in range(config.workers)
    ]
    for proc in procs:
        proc.start()

    match: Optional[Match] = None
    finished = 0
    interrupted = False
    try:
        while finished < config.workers:
            try:
                item = result_q.get(timeout=0.5)
            except queue.Empty:
                item = ...
            if item is None:
                finished += 1
            elif isinstance(item, Match):
                match = item
                stop_event.set()
            if progress is not None:
                progress(sum(counters), time.monotonic() - started)
            if match is not None:
                break
            if config.time_limit and time.monotonic() - started >= config.time_limit:
                stop_event.set()
    except KeyboardInterrupt:
        interrupted = True
        stop_event.set()
    finally:
        for proc in procs:
            proc.join(timeout=2.0)
            if proc.is_alive():
                proc.terminate()

    keys_tried = sum(counters)
    return SearchReport(match, keys_tried, time.monotonic() - started, interrupted)


def _run_single(config: SearchConfig, progress, started: float) -> SearchReport:
    state = {"count": 0, "last": 0.0}
    interrupted = False

    def bump(n: int) -> None:
        state["count"] += n
        now = time.monotonic()
        if progress is not None and now - state["last"] >= 0.5:
            state["last"] = now
            progress(state["count"], now - started)

    try:
        match = _scan(config, 0, on_progress=bump)
    except KeyboardInterrupt:
        match, interrupted = None, True

    return SearchReport(match, state["count"], time.monotonic() - started, interrupted)
