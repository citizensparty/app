#!/bin/sh
# Install (or update) the Citizens Party registrar on a Linux server, as a service that starts itself after a reboot.
# For the party's own computers only; this is never published on the website (see docs/registrar.md).
#
#   tar xzf citizens-registrar-linux.tar.gz && sudo sh citizens-registrar/install.sh
#
# If this computer already runs a host installed with citizensparty.ca/install.sh, the registrar uses the host's data
# folder (/var/lib/citizens-host/data), so it finds the registrar key and stamping keys a 0.3 host made there and
# carries on with them. Otherwise it makes its own key there on first run (the owner then lists it).
# Settings: /etc/citizens-registrar.env, then: sudo systemctl restart citizens-registrar
# Log: journalctl -u citizens-registrar -e
set -eu
fail() { echo "  $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "Run it with sudo:  sudo sh $0"
command -v systemctl >/dev/null 2>&1 || fail "This computer doesn't use systemd."
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) fail "This computer's processor ($(uname -m)) isn't supported." ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -x "$HERE/linux-$ARCH/citizens-registrar" ] || fail "Missing $HERE/linux-$ARCH/citizens-registrar; unpack the whole .tar.gz first."

id citizens >/dev/null 2>&1 || useradd --system --home-dir /var/lib/citizens-host --shell /usr/sbin/nologin citizens 2>/dev/null \
  || useradd -r -d /var/lib/citizens-host -s /sbin/nologin citizens
mkdir -p /opt/citizens-registrar /var/lib/citizens-host/data
chown -R citizens:citizens /var/lib/citizens-host
chmod 700 /var/lib/citizens-host
systemctl stop citizens-registrar 2>/dev/null || true
install -m 755 "$HERE/linux-$ARCH/citizens-registrar" /opt/citizens-registrar/citizens-registrar
[ -f /etc/citizens-registrar.env ] || cat > /etc/citizens-registrar.env <<'X'
# Optional settings for the Citizens Party registrar. After a change: sudo systemctl restart citizens-registrar
# Hosts to use instead of the party's and the directory's:
# HOSTS=wss://a.example.ca,wss://b.example.ca
# Stop approving everyone (beta):
# AUTO_APPROVE=off
X
chmod 600 /etc/citizens-registrar.env
cat > /etc/systemd/system/citizens-registrar.service <<'X'
[Unit]
Description=Citizens Party registrar
Wants=network-online.target
After=network-online.target

[Service]
User=citizens
Group=citizens
WorkingDirectory=/var/lib/citizens-host
Environment=DATA_DIR=/var/lib/citizens-host/data
EnvironmentFile=-/etc/citizens-registrar.env
ExecStart=/opt/citizens-registrar/citizens-registrar
Restart=always
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/citizens-host

[Install]
WantedBy=multi-user.target
X
systemctl daemon-reload
systemctl enable --now citizens-registrar >/dev/null 2>&1 || systemctl enable --now citizens-registrar
echo "  Started. Its first lines:"
sleep 8
journalctl -u citizens-registrar -n 8 --no-pager -o cat || true
echo
echo "  Done. It runs by itself from now on, including after a reboot."
echo "  Log: journalctl -u citizens-registrar -e"
