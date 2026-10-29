#!/usr/bin/env python3
"""Make app/geo/places.json: BC's populated places (cities, towns, villages, communities and neighborhoods) with their
positions, from BC Geographical Names (apps.gov.bc.ca/pub/bcgnws, Open Government Licence - British Columbia).

The app suggests places from this list as members type, on the device: nothing they type is sent anywhere.
Run it again to refresh the list:  python3 tools/make_places.py
"""
import json, pathlib, urllib.request, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://apps.gov.bc.ca/pub/bcgnws/names/search?outputFormat=json&outputSRS=4326&name=*&featureCategory=%d&itemsPerPage=200&startIndex=%d"
KINDS = {1: "Incorporated", 2: "Unincorporated Rural", 3: "Unincorporated Urban"}


def fetch(cat):
    out, start = [], 1
    while True:
        for attempt in range(4):
            try:
                d = json.load(urllib.request.urlopen(API % (cat, start), timeout=60))
                break
            except Exception:
                time.sleep(3)
        else:
            raise SystemExit("couldn't reach BC Geographical Names")
        fs = d.get("features", [])
        out += fs
        start += len(fs)
        if not fs or start > d["properties"]["totalResults"]:
            return out


def main():
    rows, seen = [], set()
    for cat in KINDS:
        for f in fetch(cat):
            p = f["properties"]
            t = p.get("featureType", "")
            if p.get("status") not in ("adopted", None) or not f.get("geometry") or "Railway" in t or t.startswith(("Former", "Abandoned", "Post Office")):
                continue  # only places people live now
            lon, lat = f["geometry"]["coordinates"][:2]
            name = p["name"]
            key = (name.lower(), round(lat, 2), round(lon, 2))
            if key in seen:
                continue
            seen.add(key)
            # 1: a municipality, 2: a community, 3: a neighborhood of a city
            rows.append([name, round(lat, 3), round(lon, 3), cat, p.get("featureType", "")])
    rows.sort(key=lambda r: (r[3], r[0]))
    path = ROOT / "app/geo/places.json"
    path.write_text(json.dumps([r[:4] for r in rows], separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(len(rows), "places ->", path, path.stat().st_size // 1024, "KB")
    from collections import Counter
    print(Counter(r[3] for r in rows), Counter(r[4] for r in rows).most_common(12))


if __name__ == "__main__":
    main()
