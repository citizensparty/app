"""BIP-340 Schnorr signatures over secp256k1 (the signatures Nostr uses).

Uses coincurve when it's installed (fast, C); otherwise a pure-Python version adapted from the BIP-340
reference code, with Jacobian coordinates so a check takes a few milliseconds.
"""
import hashlib

p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798, 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)


def tagged_hash(tag, msg):
    t = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(t + t + msg).digest()


# ---- Jacobian point arithmetic ----
def _dbl(P):
    X, Y, Z = P
    if Y == 0:
        return (0, 1, 0)
    S = 4 * X * Y * Y % p
    M = 3 * X * X % p
    X2 = (M * M - 2 * S) % p
    return (X2, (M * (S - X2) - 8 * pow(Y, 4, p)) % p, 2 * Y * Z % p)


def _add(P, Q):
    if P[2] == 0:
        return Q
    if Q[2] == 0:
        return P
    Z1s, Z2s = P[2] * P[2] % p, Q[2] * Q[2] % p
    U1, U2 = P[0] * Z2s % p, Q[0] * Z1s % p
    S1, S2 = P[1] * Z2s * Q[2] % p, Q[1] * Z1s * P[2] % p
    if U1 == U2:
        return _dbl(P) if S1 == S2 else (0, 1, 0)
    H, R = (U2 - U1) % p, (S2 - S1) % p
    H2 = H * H % p
    H3 = H * H2 % p
    U1H2 = U1 * H2 % p
    X3 = (R * R - H3 - 2 * U1H2) % p
    return (X3, (R * (U1H2 - X3) - S1 * H3) % p, H * P[2] * Q[2] % p)


def _mul(P, k):
    R, Q = (0, 1, 0), (P[0], P[1], 1)
    while k:
        if k & 1:
            R = _add(R, Q)
        Q = _dbl(Q)
        k >>= 1
    return R


def _affine(P):
    if P[2] == 0:
        return None
    zi = pow(P[2], -1, p)
    return (P[0] * zi * zi % p, P[1] * zi * zi * zi % p)


def _lift_x(x):
    if x >= p:
        return None
    y_sq = (pow(x, 3, p) + 7) % p
    y = pow(y_sq, (p + 1) // 4, p)
    if pow(y, 2, p) != y_sq:
        return None
    return (x, y if y & 1 == 0 else p - y)


def _py_verify(pub, msg, sig):
    if len(pub) != 32 or len(sig) != 64:
        return False
    P = _lift_x(int.from_bytes(pub, "big"))
    r, s = int.from_bytes(sig[:32], "big"), int.from_bytes(sig[32:], "big")
    if P is None or r >= p or s >= n:
        return False
    e = int.from_bytes(tagged_hash("BIP0340/challenge", sig[:32] + pub + msg), "big") % n
    R = _affine(_add(_mul(G, s), _mul(P, n - e)))
    return R is not None and R[1] % 2 == 0 and R[0] == r


def pubkey_gen(seckey):
    d = int.from_bytes(seckey, "big")
    if not 1 <= d < n:
        raise ValueError("bad secret key")
    return _affine(_mul(G, d))[0].to_bytes(32, "big")


def sign(seckey, msg, aux):
    d0 = int.from_bytes(seckey, "big")
    P = _affine(_mul(G, d0))
    d = d0 if P[1] % 2 == 0 else n - d0
    t = (d ^ int.from_bytes(tagged_hash("BIP0340/aux", aux), "big")).to_bytes(32, "big")
    px = P[0].to_bytes(32, "big")
    k0 = int.from_bytes(tagged_hash("BIP0340/nonce", t + px + msg), "big") % n
    R = _affine(_mul(G, k0))
    k = k0 if R[1] % 2 == 0 else n - k0
    rx = R[0].to_bytes(32, "big")
    e = int.from_bytes(tagged_hash("BIP0340/challenge", rx + px + msg), "big") % n
    return rx + ((k + e * d) % n).to_bytes(32, "big")


try:
    from coincurve import PublicKeyXOnly

    def verify(pub, msg, sig):
        try:
            return PublicKeyXOnly(pub).verify(sig, msg)
        except Exception:
            return False
except ImportError:
    verify = _py_verify
