"""Nostr events: serialize, check and sign (NIP-01). Standard library plus schnorr.py. Used by tools/party.py and the tests; the host itself is in Go (host/)."""
import hashlib, json, secrets, time

import schnorr

KIND_DOC = 30078          # NIP-78 app data, parameterized replaceable
KIND_AUTH = 22242         # NIP-42


def tag(ev, name):
    for t in ev.get("tags", []):
        if len(t) >= 2 and t[0] == name:
            return t[1]
    return None


def serialize(ev):
    return json.dumps([0, ev["pubkey"], ev["created_at"], ev["kind"], ev["tags"], ev["content"]], separators=(",", ":"), ensure_ascii=False)


def check_sig(ev):
    try:
        if hashlib.sha256(serialize(ev).encode()).hexdigest() != ev["id"]:
            return False
        return schnorr.verify(bytes.fromhex(ev["pubkey"]), bytes.fromhex(ev["id"]), bytes.fromhex(ev["sig"]))
    except Exception:
        return False


def sign(secret, kind, tags, content, created_at=None):
    ev = {"pubkey": schnorr.pubkey_gen(secret).hex(), "created_at": int(time.time()) if created_at is None else created_at, "kind": kind, "tags": tags, "content": content}
    ev["id"] = hashlib.sha256(serialize(ev).encode()).hexdigest()
    ev["sig"] = schnorr.sign(secret, bytes.fromhex(ev["id"]), secrets.token_bytes(32)).hex()
    return ev
