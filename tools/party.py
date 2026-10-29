#!/usr/bin/env python3
"""Manage the party's root settings: the owner key, the party's own (seed) hosts, the registrars and the caps.

The owner key is a normal member key made from 12 words (NIP-06), so the same words restore it in the app.
Its secret is kept at ~/.citizensparty/owner.key (readable only by you), never in this repo.

  python3 tools/party.py init                 make the owner key; prints the 12 words ONCE
  python3 tools/party.py restore              type the 12 words to put the owner key back on this computer
  python3 tools/party.py show                 the owner's public key, hosts and registrars
  python3 tools/party.py add-host <wss://url> <host pubkey hex> [name]   a seed host: new hosts and apps start here
  python3 tools/party.py remove-host <wss://url>                        (other hosts announce themselves; no need to add them)
  python3 tools/party.py add-registrar <npub or hex>
  python3 tools/party.py remove-registrar <npub or hex>
  python3 tools/party.py member-cap <n>       the most members the hosts will approve (default 10000)
  python3 tools/party.py host-cap <n>         the most hosts the network lists (default 10000)
  python3 tools/party.py sign                 sign config/party.json -> config/party.signed.json (build.py ships it)
  python3 tools/party.py publish              send the signed config to the seed hosts now (needs: pip install websockets)

After any change: sign, rebuild (python3 tools/build.py), upload dist/site. Hosts fetch the signed config from
citizensparty.ca/app/party.json every hour; publish sends it right away. The record is public: anyone can read it.
"""
import getpass, hashlib, hmac, json, os, pathlib, secrets, sys, time, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import schnorr
from events import sign, KIND_DOC

CFG = ROOT / "config/party.json"
SIGNED = ROOT / "config/party.signed.json"
KEYDIR = pathlib.Path(os.environ.get("CITIZENS_HOME", pathlib.Path.home() / ".citizensparty"))
KEYFILE = KEYDIR / "owner.key"
WORDS = (ROOT / "tools/bip39-english.txt").read_text().split()

# ---- NIP-06: 12 words -> BIP-39 seed -> BIP-32 m/44'/1237'/0'/0/0 ----
N = schnorr.n


def words_new():
    ent = secrets.token_bytes(16)
    bits = bin(int.from_bytes(ent, "big"))[2:].zfill(128) + bin(hashlib.sha256(ent).digest()[0])[2:].zfill(8)[:4]
    return " ".join(WORDS[int(bits[i:i + 11], 2)] for i in range(0, 132, 11))


def words_ok(m):
    w = m.split()
    if len(w) != 12 or any(x not in WORDS for x in w):
        return False
    bits = "".join(bin(WORDS.index(x))[2:].zfill(11) for x in w)
    ent = int(bits[:128], 2).to_bytes(16, "big")
    return bits[128:] == bin(hashlib.sha256(ent).digest()[0])[2:].zfill(8)[:4]


def _ser_p(k):
    P = schnorr._affine(schnorr._mul(schnorr.G, k))
    return bytes([2 + (P[1] & 1)]) + P[0].to_bytes(32, "big")


def key_from_words(m):
    m = unicodedata.normalize("NFKD", " ".join(m.split()))
    seed = hashlib.pbkdf2_hmac("sha512", m.encode(), b"mnemonic", 2048)
    I = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    k, c = int.from_bytes(I[:32], "big"), I[32:]
    for i in (44 | 1 << 31, 1237 | 1 << 31, 0 | 1 << 31, 0, 0):
        data = (b"\0" + k.to_bytes(32, "big") if i >> 31 else _ser_p(k)) + i.to_bytes(4, "big")
        I = hmac.new(c, data, hashlib.sha512).digest()
        k, c = (int.from_bytes(I[:32], "big") + k) % N, I[32:]
    return k.to_bytes(32, "big")


# ---- bech32 for npub ----
CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(v):
    g = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for x in v:
        b = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ x
        for i in range(5):
            chk ^= g[i] if (b >> i) & 1 else 0
    return chk


def _conv(data, f, t, pad):
    acc = bits = 0; out = []
    for v in data:
        acc = acc << f | v; bits += f
        while bits >= t:
            bits -= t; out.append(acc >> bits & (1 << t) - 1)
    if pad and bits:
        out.append(acc << t - bits & (1 << t) - 1)
    return out


def npub(hexkey):
    d = _conv(bytes.fromhex(hexkey), 8, 5, True)
    hrp = "npub"
    exp = [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]
    pm = _polymod(exp + d + [0] * 6) ^ 1
    return hrp + "1" + "".join(CH[x] for x in d + [pm >> 5 * (5 - i) & 31 for i in range(6)])


def to_hex(k):
    if k.startswith("npub1"):
        d = [CH.index(x) for x in k[5:]][:-6]
        return bytes(_conv(d, 5, 8, False)).hex()
    bytes.fromhex(k)
    assert len(k) == 64
    return k.lower()


# ---- config ----
def load():
    if CFG.exists():
        return json.loads(CFG.read_text())
    return {"owners": [], "registrars": [], "hosts": []}


def save(c):
    CFG.parent.mkdir(exist_ok=True)
    CFG.write_text(json.dumps(c, indent=2) + "\n")
    print("updated", CFG.relative_to(ROOT), "(run: python3 tools/party.py sign)")


def owner_secret():
    if not KEYFILE.exists():
        sys.exit("No owner key on this computer. Run: python3 tools/party.py init (or restore)")
    return bytes.fromhex(KEYFILE.read_text().strip())


def store_key(sk):
    KEYDIR.mkdir(mode=0o700, exist_ok=True)
    KEYFILE.write_text(sk.hex() + "\n")
    os.chmod(KEYFILE, 0o600)
    pk = schnorr.pubkey_gen(sk).hex()
    c = load()
    if pk not in c["owners"]:
        c["owners"].append(pk)
        save(c)
    print("owner key saved to", KEYFILE)
    print("owner public key:", npub(pk))


def signed_event(c, sk):
    content = {"hosts": c["hosts"], "registrars": c["registrars"], "at": int(time.time())}
    for k in ("memberCap", "hostCap"):
        if c.get(k):
            content[k] = int(c[k])
    return sign(sk, KIND_DOC, [["d", "party/config"], ["c", "party"], ["p", "1"], ["ms", str(int(time.time() * 1000) % 1000)]], json.dumps(content, separators=(",", ":")))


def main(a):
    cmd = a[0] if a else "show"
    c = load()
    if cmd == "init":
        if KEYFILE.exists() and "--force" not in a:
            sys.exit("An owner key already exists at %s. Use --force to replace it (the old one stops being owner only when you remove it from config/party.json)." % KEYFILE)
        w = words_new()
        print("\nWrite these 12 words down, on paper, and keep them somewhere safe.\nThey are the party's master key. Anyone who has them controls the party settings.\n")
        print("   " + w + "\n")
        store_key(key_from_words(w))
        print("\nTo use the same key in the app: open the app, choose 'I already have a key' and type the 12 words.")
    elif cmd == "restore":
        w = " ".join(getpass.getpass("12 words (hidden): ").lower().split())
        if not words_ok(w):
            sys.exit("Those words don't check out. Check the spelling and order.")
        store_key(key_from_words(w))
    elif cmd == "show":
        print("owners:", *[npub(k) for k in c["owners"]] or ["(none yet: run init)"])
        print("registrars:", *[npub(k) for k in c["registrars"]] or ["(none: only the owner approves members)"])
        print("hosts:")
        for h in c["hosts"]:
            print("  ", h["url"], h.get("name", ""), h.get("pubkey", "")[:16] + "…")
        print("member cap:", c.get("memberCap") or 10000, " host cap:", c.get("hostCap") or 10000)
        print("signed:", "yes" if SIGNED.exists() else "no")
    elif cmd == "add-host":
        url, pk = a[1], to_hex(a[2])
        c["hosts"] = [h for h in c["hosts"] if h["url"] != url] + [{"url": url, "pubkey": pk, "name": " ".join(a[3:]) or url}]
        save(c)
    elif cmd == "remove-host":
        c["hosts"] = [h for h in c["hosts"] if h["url"] != a[1]]; save(c)
    elif cmd == "add-registrar":
        k = to_hex(a[1])
        if k not in c["registrars"]:
            c["registrars"].append(k)
        save(c)
    elif cmd == "remove-registrar":
        k = to_hex(a[1]); c["registrars"] = [x for x in c["registrars"] if x != k]; save(c)
    elif cmd in ("member-cap", "host-cap"):
        c["memberCap" if cmd == "member-cap" else "hostCap"] = int(a[1]); save(c)
    elif cmd == "sign":
        ev = signed_event(c, owner_secret())
        if ev["pubkey"] not in c["owners"]:
            sys.exit("The key on this computer isn't listed as an owner in config/party.json.")
        SIGNED.write_text(json.dumps(ev, indent=1) + "\n")
        print("signed", SIGNED.relative_to(ROOT))
    elif cmd == "publish":
        import asyncio
        from websockets.asyncio.client import connect
        ev = json.loads(SIGNED.read_text())

        async def go():
            for h in c["hosts"]:
                try:
                    async with connect(h["url"], open_timeout=10) as ws:
                        await ws.send(json.dumps(["EVENT", ev]))
                        while True:
                            m = json.loads(await asyncio.wait_for(ws.recv(), 10))
                            if m[0] == "OK":
                                print(h["url"], "accepted" if m[2] else "refused: " + m[3]); break
                except Exception as e:
                    print(h["url"], "unreachable:", e)
        asyncio.run(go())
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
