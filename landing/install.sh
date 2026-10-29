#!/bin/sh
# Install (or update) a Citizens Party host on a Linux server, as a service that starts itself after a reboot.
#
#   curl -fsSL https://citizensparty.ca/install.sh | sudo sh
#
# What it does:
#   - downloads the host program for this computer (x64 or ARM 64-bit) from citizensparty.ca
#   - runs it as the service "citizens-host", under its own user "citizens", with its data in /var/lib/citizens-host
#   - shows the host's status when you log in; "citizens-host status" shows it live
# Run it again to update; the record and the host's key are kept.
# Optional settings (a fixed tunnel address, a name): /etc/citizens-host.env, then: sudo systemctl restart citizens-host
# To remove it: sudo systemctl disable --now citizens-host, then delete /opt/citizens-host and /var/lib/citizens-host.
set -eu

SITE="${CITIZENS_SITE:-https://citizensparty.ca}"
fail() { echo "  $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "Run it with sudo:  curl -fsSL $SITE/install.sh | sudo sh"
[ "$(uname -s)" = Linux ] || fail "This installer is for Linux. On Windows, download citizens-host-windows.zip from $SITE/host"
command -v systemctl >/dev/null 2>&1 || fail "This computer doesn't use systemd; run the program by hand instead (see $SITE/host)."
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) fail "This computer's processor ($(uname -m)) isn't supported yet. Supported: x64 and ARM 64-bit." ;;
esac
command -v tar >/dev/null 2>&1 || fail "tar is missing; install it first."
if command -v curl >/dev/null 2>&1; then fetch() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then fetch() { wget -qO "$2" "$1"; }
else fail "curl or wget is needed."; fi

echo "  Installing the Citizens Party host ($ARCH)…"
# Tor gives the host a Tor address for ballots. On x64 the host downloads it by itself; on ARM, install the system's.
if [ "$ARCH" = arm64 ] && ! command -v tor >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "  Installing Tor…"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tor >/dev/null 2>&1 && systemctl disable --now tor >/dev/null 2>&1 || true
  fi
  command -v tor >/dev/null 2>&1 || echo "  Note: install Tor (for example: sudo apt install tor) so members can send ballots to this host through Tor."
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fetch "$SITE/downloads/citizens-host-linux-$ARCH.tar.gz" "$TMP/host.tar.gz" || fail "Couldn't download the host program from $SITE."
tar xzf "$TMP/host.tar.gz" -C "$TMP"
[ -x "$TMP/citizens-host/citizens-host" ] || fail "The download looks broken; try again in a minute."

id citizens >/dev/null 2>&1 || useradd --system --home-dir /var/lib/citizens-host --shell /usr/sbin/nologin citizens 2>/dev/null \
  || useradd -r -d /var/lib/citizens-host -s /sbin/nologin citizens
mkdir -p /opt/citizens-host /var/lib/citizens-host/data
chown -R citizens:citizens /var/lib/citizens-host
chmod 700 /var/lib/citizens-host
systemctl stop citizens-host 2>/dev/null || true
install -m 755 "$TMP/citizens-host/citizens-host" /opt/citizens-host/citizens-host
install -m 644 "$TMP/citizens-host/README.md" /opt/citizens-host/README.md
ln -sf /opt/citizens-host/citizens-host /usr/local/bin/citizens-host
[ -f /etc/citizens-host.env ] || cat > /etc/citizens-host.env <<'EOF'
# Optional settings for the Citizens Party host. After a change: sudo systemctl restart citizens-host
# A name members see:
# HOST_NAME="Citizens Party host (Oracle, Toronto)"
# A fixed address with your own Cloudflare tunnel (otherwise a free quick tunnel is used):
# TUNNEL_TOKEN=
# RELAY_URL=wss://h1.example.ca
EOF
chmod 600 /etc/citizens-host.env

cat > /etc/systemd/system/citizens-host.service <<'EOF'
[Unit]
Description=Citizens Party host
Documentation=https://citizensparty.ca/host
Wants=network-online.target
After=network-online.target

[Service]
User=citizens
Group=citizens
WorkingDirectory=/var/lib/citizens-host
Environment=DATA_DIR=/var/lib/citizens-host/data STATUS=off
EnvironmentFile=-/etc/citizens-host.env
ExecStart=/opt/citizens-host/citizens-host
Restart=always
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/citizens-host

[Install]
WantedBy=multi-user.target
EOF

# the status when you log in (interactive shells only)
cat > /etc/profile.d/citizens-host.sh <<'EOF'
if [ -t 1 ] && [ -n "${PS1:-}" ] && command -v citizens-host >/dev/null 2>&1; then
  echo; citizens-host status --once 2>/dev/null; echo " Live view: citizens-host status"; echo
fi
EOF

systemctl daemon-reload
systemctl enable --now citizens-host >/dev/null 2>&1 || systemctl enable --now citizens-host
echo "  Started. It's finding the other hosts and coming online; this takes about a minute."
i=0
while [ $i -lt 30 ]; do
  sleep 2; i=$((i+1))
  if citizens-host status --once 2>/dev/null | grep -q "wss://"; then break; fi
done
echo
citizens-host status --once || true
echo
echo "  Done. It runs by itself from now on, including after a reboot."
echo "  Live view: citizens-host status     Log: journalctl -u citizens-host -e"
