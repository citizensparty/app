# The registrar program (party computers only)

The registrar approves new members and stamps members' voting keys each quarter (secret ballots). It's a separate
program from the host, built from the same code (`host/registrar.go`, `go build -tags registrar`). `tools/build.py`
puts it in `dist/registrar/<os>-<arch>/`. It is never published on the website: it only works once the party lists
its key, so members would have no use for it.

- It has its own key in `data/registrar.key` (never the party key), printed when it starts.
- It does nothing until the owner lists that key: `python3 tools/party.py add-registrar <key>`, `sign`, then
  `python3 tools/deploy.py` (hosts and apps pick up the list within the hour; send `party.signed.json` to hosts for
  it to take effect at once).
- It doesn't listen for anything. It connects out to up to 5 hosts (the party's hosts and the directory's list),
  like a member's app, so it needs no public address, tunnel or open port. It checks every record itself.
- During the beta it approves every join request (`AUTO_APPROVE=off` stops that). After launch it will approve only
  people who passed the ID check.
- Keep `data/` private: `registrar.key` and `stampkeys.json` are secrets (whoever has them can approve and stamp).
  Lose `stampkeys.json` and it can't stamp again until next quarter.
- To stop a registrar: `python3 tools/party.py remove-registrar <key>`, `sign`, deploy.

## Running it
- **Windows:** copy `dist/registrar/windows-amd64/citizens-registrar.exe` to the computer and double-click it. Leave
  the window open.
- **Linux server:** copy `dist/registrar/citizens-registrar-linux.tar.gz` to it (on Google Cloud: SSH in the browser,
  Upload file), then `tar xzf citizens-registrar-linux.tar.gz && sudo sh citizens-registrar/install.sh`. It runs as the
  service `citizens-registrar` (user `citizens`). Next to a host installed with install.sh it uses the host's data
  folder, `/var/lib/citizens-host/data`, so a 0.3 host's registrar key carries over. Log: `journalctl -u citizens-registrar -e`.
- **Moving from a 0.3 host that was a registrar:** put the program in the same folder as the host program. It finds
  the host's `data/registrar.key` and `data/stampkeys.json` there and carries on with the same keys; the party's list
  doesn't change. Then update the host to 0.4 (which has no registrar in it).

## Settings (environment or `.env` next to the program)
| Setting | What it does |
|---|---|
| `HOSTS` | Comma-separated host addresses to use instead of the party's and the directory's. |
| `AUTO_APPROVE` | `on` (default, beta) or `off`. |
| `DATA_DIR` | Where its files live (default `data` next to the program). |
| `DIRECTORY`, `PARTY_URL` | Where it finds hosts and the signed party config (default citizensparty.ca); `off` for neither. |
