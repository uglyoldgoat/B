"""Minimal, dependency-free secp256k1 implementation.

Only what a key search needs: scalar multiplication of the generator, and
cheap incremental addition of G so a sequential walk costs one field
inversion per candidate instead of a full scalar multiply.

Points are kept in Jacobian coordinates (X, Y, Z) where x = X/Z^2 and
y = Y/Z^3.  The point at infinity is any triple with Z == 0.
"""

from __future__ import annotations

from typing import List, Tuple

# Curve parameters (y^2 = x^3 + 7 over F_p)
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
G = (Gx, Gy)

INFINITY = (0, 0, 0)

Affine = Tuple[int, int]
Jacobian = Tuple[int, int, int]


def jacobian_double(pt: Jacobian) -> Jacobian:
    """Point doubling, dbl-2009-l (a == 0)."""
    x1, y1, z1 = pt
    if z1 == 0 or y1 == 0:
        return INFINITY
    a = x1 * x1 % P
    b = y1 * y1 % P
    c = b * b % P
    d = 2 * (((x1 + b) * (x1 + b) - a - c) % P) % P
    e = 3 * a % P
    f = e * e % P
    x3 = (f - 2 * d) % P
    y3 = (e * (d - x3) - 8 * c) % P
    z3 = 2 * y1 * z1 % P
    return (x3, y3, z3)


def jacobian_add_affine(pt: Jacobian, q: Affine) -> Jacobian:
    """Mixed addition: Jacobian + affine, madd-2007-bl (Z2 == 1)."""
    x1, y1, z1 = pt
    if z1 == 0:
        return (q[0], q[1], 1)
    x2, y2 = q
    z1z1 = z1 * z1 % P
    u2 = x2 * z1z1 % P
    s2 = y2 * z1 % P * z1z1 % P
    h = (u2 - x1) % P
    r = (s2 - y1) % P
    if h == 0:
        if r == 0:
            return jacobian_double(pt)
        return INFINITY
    hh = h * h % P
    i = 4 * hh % P
    j = h * i % P
    r = 2 * r % P
    v = x1 * i % P
    x3 = (r * r - j - 2 * v) % P
    y3 = (r * (v - x3) - 2 * y1 * j) % P
    z3 = ((z1 + h) * (z1 + h) - z1z1 - hh) % P
    return (x3, y3, z3)


def to_affine(pt: Jacobian) -> Affine:
    """Convert to affine coordinates.  Costs one modular inversion."""
    x, y, z = pt
    if z == 0:
        raise ValueError("point at infinity has no affine representation")
    if z == 1:
        return (x % P, y % P)
    zinv = pow(z, P - 2, P)
    zinv2 = zinv * zinv % P
    return (x * zinv2 % P, y * zinv2 % P * zinv % P)


def _build_comb_table(window: int = 4) -> List[List[Affine]]:
    """Precompute j * 16^i * G so mul_g needs no doublings at all.

    Returns table[i][j - 1] == (j * 2^(window*i)) * G in affine form, for
    j in 1..2^window - 1 and i covering the whole 256-bit scalar range.
    """
    entries = (1 << window) - 1
    rows = (256 + window - 1) // window
    table: List[List[Affine]] = []
    base: Affine = G
    for _ in range(rows):
        acc: Jacobian = INFINITY
        row: List[Affine] = []
        for _ in range(entries):
            acc = jacobian_add_affine(acc, base)
            row.append(to_affine(acc))
        table.append(row)
        # base *= 2^window
        doubled: Jacobian = (base[0], base[1], 1)
        for _ in range(window):
            doubled = jacobian_double(doubled)
        base = to_affine(doubled)
    return table


_WINDOW = 4
_MASK = (1 << _WINDOW) - 1
_COMB: List[List[Affine]] | None = None


def _comb() -> List[List[Affine]]:
    global _COMB
    if _COMB is None:
        _COMB = _build_comb_table(_WINDOW)
    return _COMB


def mul_g_jacobian(k: int) -> Jacobian:
    """k * G, left in Jacobian form (no inversion)."""
    k %= N
    if k == 0:
        return INFINITY
    table = _comb()
    acc: Jacobian = INFINITY
    i = 0
    while k:
        digit = k & _MASK
        if digit:
            acc = jacobian_add_affine(acc, table[i][digit - 1])
        k >>= _WINDOW
        i += 1
    return acc


def mul_g(k: int) -> Affine:
    """k * G in affine coordinates."""
    return to_affine(mul_g_jacobian(k))


def mul(k: int, point: Affine) -> Affine:
    """k * point for an arbitrary point (double-and-add)."""
    k %= N
    if k == 0:
        raise ValueError("multiplying by 0 yields the point at infinity")
    acc: Jacobian = INFINITY
    addend: Jacobian = (point[0], point[1], 1)
    while k:
        if k & 1:
            acc = jacobian_add_affine(acc, to_affine(addend))
        addend = jacobian_double(addend)
        k >>= 1
    return to_affine(acc)


def batch_to_affine(points: List[Jacobian]) -> List[Affine]:
    """Convert many Jacobian points at once (Montgomery's inversion trick).

    One inversion for the whole batch instead of one per point.  Inversion
    costs ~150us in pure Python against ~7us for a point addition, so this
    is the difference between a toy and something worth running.
    """
    if not points:
        return []
    if any(pt[2] == 0 for pt in points):
        return [to_affine(pt) for pt in points]

    prefix: List[int] = []
    running = 1
    for _, _, z in points:
        prefix.append(running)
        running = running * z % P

    inverse = pow(running, P - 2, P)
    out: List[Affine] = [(0, 0)] * len(points)
    for i in range(len(points) - 1, -1, -1):
        x, y, z = points[i]
        zinv = inverse * prefix[i] % P
        inverse = inverse * z % P
        zinv2 = zinv * zinv % P
        out[i] = (x * zinv2 % P, y * zinv2 % P * zinv % P)
    return out


DEFAULT_BATCH = 256


def walk_from(k: int, count: int, batch: int = DEFAULT_BATCH):
    """Yield (privkey, (x, y)) for `count` consecutive keys starting at k.

    Steps are chained mixed additions in Jacobian form and converted to
    affine in batches, so the amortised cost per key is one point addition.
    """
    k %= N
    if k == 0:
        k = 1
    acc = mul_g_jacobian(k)
    remaining = count
    add = jacobian_add_affine
    while remaining > 0:
        size = batch if remaining > batch else remaining
        keys: List[int] = []
        pts: List[Jacobian] = []
        for _ in range(size):
            keys.append(k)
            pts.append(acc)
            k += 1
            if k >= N:
                k = 1
                acc = mul_g_jacobian(k)
            else:
                acc = add(acc, G)
        yield from zip(keys, batch_to_affine(pts))
        remaining -= size


def mul_g_many(scalars: List[int]) -> List[Affine]:
    """k*G for several independent scalars, sharing one inversion."""
    return batch_to_affine([mul_g_jacobian(k) for k in scalars])


def is_on_curve(point: Affine) -> bool:
    x, y = point
    return (y * y - x * x * x - 7) % P == 0
