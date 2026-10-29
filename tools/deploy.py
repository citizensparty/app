#!/usr/bin/env python3
"""Deploy citizensparty.ca in one go: build dist/site, then publish it with the host directory Worker.

  python3 tools/deploy.py           build, set up the directory database the first time, deploy
  python3 tools/deploy.py --check   only show what would happen

Needs: Node (~/.local/opt/node or on PATH) and a one-time login: npx wrangler login (opens your browser).
The site and the directory run as the Worker "falling-grass-0abf" on Cloudflare's free plan (worker/).
"""
import json, os, pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
W = ROOT / "worker"
NODE = next((d for d in (os.path.expanduser("~/.local/opt/node/bin"), os.path.dirname(shutil.which("node") or "")) if d and os.path.exists(d + "/npx")), None)


def wrangler(*a, capture=False):
    env = dict(os.environ, PATH=NODE + os.pathsep + os.environ["PATH"], WRANGLER_SEND_METRICS="false")
    r = subprocess.run([NODE + "/npx", "wrangler", *a], cwd=W, env=env, text=True, capture_output=capture)
    if r.returncode:
        sys.exit((r.stderr or "") + "\nwrangler %s failed" % " ".join(a))
    return r.stdout


def main():
    if not NODE:
        sys.exit("Node isn't installed (expected ~/.local/opt/node).")
    if not (W / "node_modules").exists():
        subprocess.run([NODE + "/npm", "ci", "--no-fund", "--no-audit"], cwd=W, check=True, env=dict(os.environ, PATH=NODE + os.pathsep + os.environ["PATH"]))
    who = wrangler("whoami", capture=True)
    if "not authenticated" in who.lower():
        sys.exit("Log in to Cloudflare first:  cd worker && " + NODE + "/npx wrangler login")
    toml = (W / "wrangler.toml").read_text()
    if "00000000-0000-0000-0000-000000000000" in toml:  # first deploy: make the directory database
        dbs = json.loads(wrangler("d1", "list", "--json", capture=True) or "[]")
        db = next((d for d in dbs if d.get("name") == "citizens-hosts"), None)
        if not db:
            if "--check" in sys.argv:
                print("would create the D1 database citizens-hosts"); return
            out = wrangler("d1", "create", "citizens-hosts", capture=True)
            m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", out)
            if not m:
                sys.exit("Couldn't read the new database id:\n" + out)
            uuid = m.group(0)
        else:
            uuid = db["uuid"]
        toml = toml.replace("00000000-0000-0000-0000-000000000000", uuid)
        (W / "wrangler.toml").write_text(toml)
        print("directory database:", uuid)
    if "--check" in sys.argv:
        print("would build dist/site, apply worker/schema.sql and deploy"); return
    subprocess.run([sys.executable, str(ROOT / "tools/build.py")], check=True)
    wrangler("d1", "execute", "citizens-hosts", "--remote", "--file", "schema.sql", "--yes")
    wrangler("deploy")
    print("\nDeployed: https://citizensparty.ca  (hosts: https://citizensparty.ca/hosts.json)")


if __name__ == "__main__":
    main()
