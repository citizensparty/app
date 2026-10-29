"""Build the Go host once for the tests and start copies of it."""
import os, pathlib, shutil, subprocess, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tests/out"
BIN = OUT / "citizens-host"
REG = OUT / "citizens-registrar"


def go():
    for g in (shutil.which("go"), os.path.expanduser("~/.local/opt/go/bin/go")):
        if g and os.path.exists(g):
            return g
    raise SystemExit("Go isn't installed (see host/README.md, Building)")


def build():
    OUT.mkdir(exist_ok=True)
    env = dict(os.environ, GOTOOLCHAIN="local", CGO_ENABLED="0")
    env.setdefault("GOPATH", os.path.expanduser("~/.local/opt/gopath"))
    subprocess.run([go(), "build", "-o", str(BIN), "."], cwd=ROOT / "host", env=env, check=True)
    subprocess.run([go(), "build", "-tags", "registrar", "-o", str(REG), "."], cwd=ROOT / "host", env=env, check=True)
    return BIN


def start(port, owner_pk, peers="", secret=None, db=None, relay_url=None, check_every=None, directory="off", tor="off"):
    """Start a host on 127.0.0.1:port. Returns the process."""
    env = dict(os.environ, PORT=str(port), DB_PATH=db or tempfile.mkdtemp() + "/db.sqlite", OWNER_PUBKEYS=owner_pk, PEERS=peers,
               HOST_SECRET=secret.hex() if secret else "", RELAY_URL=relay_url or f"ws://127.0.0.1:{port}", TUNNEL="off",
               PARTY_URL="off", STATUS="off", ALLOW_LOCAL_HOSTS="1", DIRECTORY=directory, TOR=tor)
    if check_every:
        env["CHECK_EVERY"] = str(check_every)
    log = open(OUT / f"host-{port}.log", "a")  # each host's log, for when a test fails
    return subprocess.Popen([str(BIN)], env=env, stdout=log, stderr=subprocess.STDOUT)


def start_registrar(hosts, owner_pk, secret, data_dir=None, **extra):
    """Start the registrar program, connected to these hosts (comma-separated). Returns the process."""
    env = dict(os.environ, HOSTS=hosts, OWNER_PUBKEYS=owner_pk, REGISTRAR_SECRET=secret.hex(), DATA_DIR=data_dir or tempfile.mkdtemp(),
               PARTY_URL="off", DIRECTORY="off", **extra)
    log = open(OUT / "registrar.log", "a")
    return subprocess.Popen([str(REG)], env=env, stdout=log, stderr=subprocess.STDOUT)
