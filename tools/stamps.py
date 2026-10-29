"""Voting stamps (blind RSA signatures, full-domain hash), the same rules as app/adapter-nostr.js and host/stamps.go.

Used by the tests to act as a registrar and as a voter.
"""
import hashlib, secrets

MR_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]


def _mr(n, a):
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2; s += 1
    x = pow(a, d, n)
    if x in (1, n - 1):
        return True
    for _ in range(s - 1):
        x = x * x % n
        if x == n - 1:
            return True
    return False


def _prime_small(n):
    if n < 2:
        return False
    for p in MR_BASES:
        if n == p:
            return True
        if n % p == 0:
            return False
    return all(_mr(n, a) for a in MR_BASES)


def grid_exp(grid):
    h = hashlib.sha256(("citizens-grid/1|" + grid).encode()).digest()
    x = (1 << 32) + (int.from_bytes(h[:4], "big") >> 1)
    if x % 2 == 0:
        x += 1
    while not _prime_small(x):
        x += 2
    return x


def mgf1(seed, n):
    out = b""
    c = 0
    while len(out) < n:
        out += hashlib.sha256(seed + c.to_bytes(4, "big")).digest()
        c += 1
    return out[:n]


def fdh(msg, n):
    k = (n.bit_length() + 7) // 8
    return int.from_bytes(mgf1(msg.encode(), k), "big") % n


def stamp_msg(period, grid, vpk):
    return "citizens-stamp/1|%s|%s|%s" % (period, grid, vpk)


def _rand_prime(bits):
    while True:
        p = secrets.randbits(bits) | (3 << (bits - 2)) | 1
        if all(p % q for q in range(3, 2000, 2) if q < p) and all(_mr(p, secrets.randbelow(p - 3) + 2) for _ in range(24)):
            return p


def keygen(bits=2048):
    p = _rand_prime(bits // 2)
    q = _rand_prime(bits // 2)
    while q == p:
        q = _rand_prime(bits // 2)
    return {"p": p, "q": q, "n": p * q}


def blind(n, grid, msg):
    """The voter's side: returns (blinded, r)."""
    e = grid_exp(grid)
    while True:
        r = secrets.randbelow(n - 2) + 2
        try:
            pow(r, -1, n)
            break
        except ValueError:
            pass
    return fdh(msg, n) * pow(r, e, n) % n, r


def sign_blinded(key, grid, blinded):
    """The registrar's side: signs without seeing the message."""
    e = grid_exp(grid)
    p1, q1 = key["p"] - 1, key["q"] - 1
    from math import gcd
    lam = p1 * q1 // gcd(p1, q1)
    return pow(blinded, pow(e, -1, lam), key["n"])


def unblind(n, sig, r):
    return sig * pow(r, -1, n) % n


def verify(n, grid, msg, sig):
    return 0 < sig < n and pow(sig, grid_exp(grid), n) == fdh(msg, n)
