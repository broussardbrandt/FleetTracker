"""Refresh positions.json with the latest AIS fixes for the TDI-Brooks fleet.

Connects to the AISStream.io websocket, listens for a few minutes for the
fleet's MMSIs, and merges any newer fixes into positions.json. A vessel that
is out of coverage keeps its last known position (the page marks it stale).

Environment:
  AISSTREAM_API_KEY   required, from https://aisstream.io
  LISTEN_SECONDS      optional, default 240
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import websockets

FLEET = {
    "577030000": "nautilus",
    "577275000": "gyre",
    "577207000": "proteus",
    "338257000": "brooks-mccall",
    "577759000": "miss-emma-mccall",
}

NAV_STATUS = {
    0: "Under way using engine",
    1: "At anchor",
    2: "Not under command",
    3: "Restricted manoeuvrability",
    4: "Constrained by draught",
    5: "Moored",
    6: "Aground",
    7: "Engaged in fishing",
    8: "Under way sailing",
}

POSITION_TYPES = ("PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport")
URL = "wss://stream.aisstream.io/v0/stream"
OUT = Path(__file__).resolve().parent.parent / "positions.json"


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(meta):
    raw = meta.get("time_utc") or meta.get("TimeUtc")
    if raw:
        try:
            return datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S").strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            pass
    return now_iso()


def get(d, *keys):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


async def listen(api_key, seconds):
    fixes, statics = {}, {}
    sub = {
        "APIKey": api_key,
        "BoundingBoxes": [[[-90, -180], [90, 180]]],
        "FiltersShipMMSI": list(FLEET),
        "FilterMessageTypes": list(POSITION_TYPES) + ["ShipStaticData"],
    }
    loop = asyncio.get_running_loop()
    end = loop.time() + seconds
    async with websockets.connect(URL, open_timeout=20) as ws:
        await ws.send(json.dumps(sub))
        while (remaining := end - loop.time()) > 0:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            if "error" in msg:
                sys.exit(f"AISStream error: {msg['error']}")
            mtype = msg.get("MessageType")
            meta = msg.get("MetaData", {})
            mmsi = str(get(meta, "MMSI", "mmsi") or "")
            vid = FLEET.get(mmsi)
            if not vid:
                continue
            body = msg.get("Message", {}).get(mtype, {})
            if mtype in POSITION_TYPES:
                lat = get(body, "Latitude") if get(body, "Latitude") is not None else get(meta, "latitude", "Latitude")
                lon = get(body, "Longitude") if get(body, "Longitude") is not None else get(meta, "longitude", "Longitude")
                if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:
                    continue
                sog, cog = get(body, "Sog"), get(body, "Cog")
                fixes[vid] = {
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "sog": None if sog is None or sog >= 102.3 else round(sog, 1),
                    "cog": None if cog is None or cog >= 360 else round(cog, 1),
                    "status": NAV_STATUS.get(get(body, "NavigationalStatus"), ""),
                    "fixTime": parse_time(meta),
                }
                print(f"{vid}: {lat:.4f}, {lon:.4f}")
            elif mtype == "ShipStaticData":
                dest = (get(body, "Destination") or "").strip()
                if dest:
                    statics[vid] = dest
    return fixes, statics


def main():
    api_key = os.environ.get("AISSTREAM_API_KEY")
    if not api_key:
        sys.exit("AISSTREAM_API_KEY is not set")
    seconds = int(os.environ.get("LISTEN_SECONDS", "240"))

    data = json.loads(OUT.read_text()) if OUT.exists() else {"vessels": {}}
    vessels = data.setdefault("vessels", {})

    try:
        fixes, statics = asyncio.run(listen(api_key, seconds))
    except (OSError, websockets.WebSocketException) as e:
        print(f"Connection problem, keeping last positions: {e}")
        fixes, statics = {}, {}

    for vid, fix in fixes.items():
        old = vessels.get(vid, {})
        if old.get("fixTime", "") > fix["fixTime"]:
            continue
        new = {**fix}
        if old.get("dest"):
            new["dest"] = old["dest"]
        vessels[vid] = new  # drops approx/area/note from older hand-entered positions
    for vid, dest in statics.items():
        if vid in vessels:
            vessels[vid]["dest"] = dest

    before = json.loads(OUT.read_text()).get("vessels") if OUT.exists() else None
    if vessels == before:
        print("No new fixes; positions.json unchanged")
        return
    data["updated"] = now_iso()
    OUT.write_text(json.dumps(data, indent=2) + "\n")
    print(f"{len(fixes)} vessel(s) updated")


if __name__ == "__main__":
    main()
