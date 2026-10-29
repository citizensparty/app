# Citizens Party

A participatory, member-run political party for British Columbia, and the app it runs on.
Website: [citizensparty.ca](https://citizensparty.ca)

- BC is divided into about 120 **grids**. Each member belongs to the grid they live in.
- Members **propose and vote on principles**. Every vote is signed on the voter's own device and sealed into a
  hash chain, so tampering is detectable.
- Ballots are **secret**: they're signed by a separate voting key carrying a blind stamp from a registrar, so a
  ballot can be checked without anyone learning whose it is. In the Android app, ballots travel through Tor.
- There's **no central server**. The record lives on member-run hosts (Nostr relays) that copy it from each other.
  Anyone can run one.

## What's here

| Folder | What it is |
| --- | --- |
| `app/` | The app (web, and inside the Android/iOS shell). `app.js` has the UI and the rules. |
| `host/` | The host program, in Go: one download for Windows and Linux, with a free tunnel built in. `registrar.go` is the separate registrar program. |
| `landing/` | The citizensparty.ca website. |
| `worker/` | The Cloudflare Worker that serves the site and the host directory. |
| `native/` | The Capacitor project for Android and iOS. |
| `config/` | The party's public settings (owner key, registrars, seed hosts), signed by the owner key. |
| `tools/` | Build, deploy, party settings and signing helpers. |
| `tests/` | End-to-end tests. |
| `docs/` | Architecture and the registrar guide. |

## Build and test

- **Build:** `python3 tools/build.py` writes `dist/site/` (website at `/`, app at `/app/`, downloads at `/downloads/`). The host program needs Go.
- **Deploy:** `python3 tools/deploy.py` (needs `npx wrangler login` in `worker/` once).
- **Party settings:** `python3 tools/party.py` (owner key, hosts, registrars, signing). The owner key is never in this repo.
- **Run a host:** see `host/README.md`, or [citizensparty.ca/host.html](https://citizensparty.ca/host.html).
- **Android APK:** `tools/build_native.sh`. iOS needs a Mac: see `native/README.md`.
- **Test:** `pip install playwright websockets && playwright install chromium`, then run the scripts in `tests/`
  (`tour.py`, `vote.py`, `record.py`, `host.py`, `nostr.py`, `directory.py`, `gate.py`, `registrar.py`).

## The record is a protocol

Every record carries a protocol version tag (`["p","1"]`). The protocol is the record itself: its signatures, who
may write what, and how votes are counted. Apps decide everything else, so anyone can build their own app on the same
record. See `docs/strategy.md`.

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). You may use, change and share this code, including to
run your own app or host, as long as you publish your changes under the same license, also when you only run them as
a service for others.
