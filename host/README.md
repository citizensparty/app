# Run a Citizens Party host

A host is a computer that keeps a full copy of the party's public record and shares it with members' apps and the other hosts. It can be a home PC, a laptop that stays on, a Raspberry Pi or a $5 server. A host can't forge or change anything: every record is signed on a member's phone, and the apps check every signature. The worst a broken host can do is go missing, and the others carry on.

## Start it
- **Windows:** extract `citizens-host-windows.zip` (Extract all), then double-click `citizens-host.exe`. If Windows says it protected your PC, click **More info**, then **Run anyway**.
- **A Linux server** (cloud server, Raspberry Pi): `curl -fsSL https://citizensparty.ca/install.sh | sudo sh`. It installs the host as the service `citizens-host` (its own user, data in `/var/lib/citizens-host`, optional settings in `/etc/citizens-host.env`), starts it after every reboot, and shows the status when you log in. `citizens-host status` shows it live; run the command again to update.
- **Linux by hand:** `tar xzf citizens-host-linux-*.tar.gz`, then `./citizens-host/citizens-host`.

That's all. No settings, no accounts. The host:
1. finds the other hosts through citizensparty.ca/hosts.json (or, if the site is down, through the list kept in the record itself) and copies the record from them;
2. puts itself online with a free Cloudflare quick tunnel: no ports to open, and your home address stays private (it downloads Cloudflare's tunnel program, `cloudflared`, the first time);
3. starts Tor and gets a Tor address (`….onion`) as well, so members' apps can send ballots to it through Tor and nobody, not even this computer, can tell where a ballot came from (it downloads Tor from the Tor Project the first time on Windows and Linux x64, and checks the download's fingerprint; on other Linux computers, install it: `sudo apt install tor`);
4. registers at citizensparty.ca and announces its addresses in the record. The directory and the other hosts check that it really holds the record before listing it, and members' apps start using it.

While it runs, the window shows its address, how many members are connected, how many hosts it copies with, how much it holds, and whether its copy matches the other hosts'. Close the window (or press Ctrl+C) to stop it.

To start it with your PC on Windows: press Win+R, type `shell:startup`, and put a shortcut to `citizens-host.exe` in that folder. On Linux, use a systemd service or `@reboot` in crontab.

Your records and the host's own key are in the `data` folder next to the program. Back it up if you move computers. To update, replace the program and keep the `data` folder.

## A fixed address (optional)
A quick tunnel's address changes every time the host restarts. The host announces the new one by itself, but a fixed address is better for a host that's always on. Quick tunnels also have no uptime guarantee from Cloudflare.
1. In the free Cloudflare dashboard: Zero Trust, then Networks, then Tunnels. Create a tunnel and add a public hostname (for example `h7.yourdomain.ca`) pointing at `http://localhost:7447`.
2. Next to the program, make a file named `.env` with:
   ```
   TUNNEL_TOKEN=<the tunnel's token>
   RELAY_URL=wss://h7.yourdomain.ca
   ```
3. Start the host again.

Already have your own address (Caddy, nginx)? Set `RELAY_URL` and `TUNNEL=off`, and proxy it to `127.0.0.1:7447`.

## Docker (Mac, Windows, Linux)
Download `docker-compose.yml` from https://citizensparty.ca/host (it's `host/docker-compose.download.yml`), put it in a new folder, then `docker compose up -d`. It builds a small image from the published Linux download (x64 or ARM, picked automatically), keeps the data in `./data`, and starts a quick tunnel. Status: `docker compose exec host citizens-host status`. Update: `docker compose build --pull --no-cache && docker compose up -d`. This is the way to run a host on a Mac.

From source instead: `host/Dockerfile` and `host/docker-compose.yml` (with Caddy or a named tunnel).

**Publishing a ready-made image** (once the code is public on GitHub), so people can skip the build:
```
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/citizensparty/citizens-host:0.2.0 -t ghcr.io/citizensparty/citizens-host:latest --push host/
```
(after `docker login ghcr.io` with a GitHub token that can write packages). Then the compose file can use `image: ghcr.io/citizensparty/citizens-host:latest` instead of `build:`, and a single line works: `docker run -d --restart unless-stopped -v "$PWD/data:/data" -e TUNNEL=auto ghcr.io/citizensparty/citizens-host`.

## How hosts keep each other honest
- Before listing a new host, each host connects to it and checks that it answers with the key that announced it, holds about as many records, and returns a few records picked at random.
- Listed hosts are checked again every half hour. One that fails three times in a row is dropped for six hours.
- At most 10,000 hosts are listed (the party config can change this). When the list is full, a new host takes the place of the worst one that's failing; if none is failing, it waits.
- Members' apps use 5 hosts at a time and test each one themselves. A host that sends a forged record, is missing most of the record, or stops answering is skipped for a day.
- Other hosts copying from this one wait whenever members' apps are busy, so members always come first.

## Settings (`.env`, all optional)
| Setting | What it does |
|---|---|
| `HOST_NAME` | The name members see. |
| `TUNNEL_TOKEN`, `RELAY_URL` | A fixed address (see above). |
| `TUNNEL` | `auto` (default: a quick tunnel), or `off`. |
| `TOR` | `auto` (default: a Tor address for ballots too), or `off`. |
| `PORT`, `BIND` | Where the host listens (default `127.0.0.1:7447`). |
| `DATA_DIR` | Where the record is kept (default: `data` next to the program). |
| `OWNER_PUBKEYS`, `PEERS` | The party's key and seed hosts. Built into the program; only for testing. |
| `STATUS` | `off` prints plain log lines instead of the status screen. |

## Building (for developers)
Needs Go 1.27 or later. `python3 tools/build.py` builds `citizens-host.exe` (Windows) and the Linux downloads with the party's key and hosts built in. By hand: `cd host && go build .`. Tests: `python3 tests/host.py` and `python3 tests/nostr.py`.
