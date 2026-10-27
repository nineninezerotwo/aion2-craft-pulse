#!/usr/bin/env python3
"""Collect Aion2Market PUBLIC item summaries for one confirmed server.

No login, hidden endpoint discovery, bypassing blocks or game traffic.
The project deliberately does NOT claim that falling listings are completed sales.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
BASE = "https://aion2.exchange/api"
LIMIT = 200
MAX_PAGES = 30
USER_AGENT = "FregionMarketPulse/0.1 (personal noncommercial tracker; low-rate summary requests)"
UTC = dt.timezone.utc


def utc_now():
    return dt.datetime.now(UTC).replace(microsecond=0)


def iso(t):
    return t.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_time(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def number(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.replace(",", "").strip()
        if value in ("", "—", "-"):
            return None
    try:
        n = float(value)
        if n < 0 or n != n or n == float("inf"):
            return None
        return int(n) if n.is_integer() else round(n, 4)
    except (TypeError, ValueError):
        return None


def first_numeric(item, fields):
    for key in fields:
        val = item
        for part in key.split("."):
            if not isinstance(val, dict):
                val = None
                break
            val = val.get(part)
        n = number(val)
        if n is not None:
            return n
    return None


def normalize(item):
    """Read defensively; unknown fields become null, never zero/sales."""
    if not isinstance(item, dict):
        return None
    item_id = item.get("item_key", item.get("item_id", item.get("id")))
    if item_id is None:
        return None
    item_id = str(item_id).strip()
    if not item_id.isdigit():
        return None
    p = first_numeric(item, (
        "cheapest", "cheapest_price", "cheapest_unit_price", "min_price",
        "lowest_price", "low", "price", "unit_price", "min_ask",
        "market.low", "market.cheapest", "listing.low", "summary.low",
    ))
    count = first_numeric(item, (
        "listings", "listing_count", "active_listings", "num_listings",
        "listings_count", "number_of_listings", "market.listings", "summary.listings",
    ))
    if count is not None:
        count = int(count)
    name = str(item.get("name") or item.get("item_name") or item_id)
    category = item.get("category") or item.get("subcategory") or item.get("category_name") or ""
    if isinstance(category, dict):
        category = category.get("name", "")
    return {"id": item_id, "name": name[:140], "category": str(category)[:90], "price": p, "listings": count}


def request_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            content_type = res.headers.get("content-type", "")
            if "json" not in content_type.lower():
                raise ValueError(f"Expected JSON but received {content_type!r}")
            return json.load(res)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403, 429):
            raise RuntimeError(f"Source declined access (HTTP {exc.code}); collector stopped. Do not bypass limits.") from exc
        raise


def verify_fregion(server_id):
    """Abort if the current API does not map this market to Asia/Elyos/Fregion."""
    worlds = request_json(f"{BASE}/servers")
    entries = worlds if isinstance(worlds, list) else (
        worlds.get("servers") or worlds.get("items") or worlds.get("data") or []
    ) if isinstance(worlds, dict) else []
    if not isinstance(entries, list):
        raise RuntimeError("Unexpected server mapping response")
    row = next((x for x in entries if isinstance(x, dict) and str(x.get("server_id")) == str(server_id)), None)
    expected = {"name": "Fregion", "region": "AS", "faction": "Elyos"}
    if row is None or any(str(row.get(k)) != v for k, v in expected.items()) or str(row.get("game_server_key")) != "1507":
        raise RuntimeError(f"API server {server_id} is not verified as Asia Elyos Fregion")
    print(f"Verified market server ID {server_id}: Asia Elyos Fregion, game key 1507", flush=True)


def pull_items(server_id, pause_seconds=1.5):
    items, offset, total = [], 0, None
    for page in range(MAX_PAGES):
        query = urllib.parse.urlencode({"sort":"name", "order":"asc", "window":"24h", "limit":LIMIT, "offset":offset, "server":server_id})
        raw = request_json(f"{BASE}/items?{query}")
        if not isinstance(raw, dict) or not isinstance(raw.get("items"), list):
            raise RuntimeError("Unexpected API response shape; collector stopped rather than saving incorrect data")
        page_items = raw["items"]
        if total is None:
            total = number(raw.get("total"))
        items.extend(page_items)
        print(f"Page {page+1}: {len(page_items)} items (total {len(items)})", flush=True)
        offset += len(page_items)
        if not page_items or (total is not None and offset >= total) or (total is None and len(page_items) < LIMIT):
            break
        time.sleep(pause_seconds)
    else:
        raise RuntimeError(f"Exceeded {MAX_PAGES} pages; API may have changed")
    if not 1 <= len(items) <= 4000:
        raise RuntimeError("No usable items or implausible item count; check the region/server ID")
    return items


def latest_snapshot(raw_items, server_id, created):
    data = {"schema":1, "ts":iso(created), "server_id":str(server_id),
            "region":"Asia", "faction":"Elyos", "server":"Fregion", "source":"aion2.exchange",
            "disclaimer":"Asking prices and active listings, NOT completed transactions",
            "items":[]}
    seen = set()
    for raw in raw_items:
        item = normalize(raw)
        if item and item["id"] not in seen:
            data["items"].append(item)
            seen.add(item["id"])
    priced = sum(x["price"] is not None for x in data["items"])
    counted = sum(x["listings"] is not None for x in data["items"])
    if not data["items"] or counted < max(1, int(len(data["items"])*0.7)) or priced < max(1, int(len(data["items"])*0.4)):
        keys = sorted({k for raw in raw_items[:5] if isinstance(raw, dict) for k in raw.keys()})
        raise RuntimeError(f"Incompatible API fields. Counted {counted}, priced {priced} / {len(data['items'])} items. Example keys: {keys}")
    return data


def compact_snapshots(snapshots, now):
    """7d hourly, days 8–30 at 6h, days 31–90 daily, preserving latest per bucket."""
    buckets = {}
    for record in snapshots:
        try:
            t = parse_time(record["ts"])
            age = (now - t).total_seconds()
            if age < -300 or age > 90 * 86400 or not isinstance(record.get("values"), dict):
                continue
            interval = 3600 if age <= 7*86400 else 21600 if age <= 30*86400 else 86400
            key = (interval, int(t.timestamp()) // interval)
            if key not in buckets or record["ts"] > buckets[key]["ts"]:
                buckets[key] = record
        except (KeyError, TypeError, ValueError):
            continue
    return sorted(buckets.values(), key=lambda x: x["ts"])


def update_history(history, latest, created):
    existing = history.get("snapshots", []) if isinstance(history, dict) else []
    values = {x["id"]:[x["price"], x["listings"]] for x in latest["items"]}
    existing.append({"ts":iso(created), "values": values})
    return {"schema":1, "server_id": latest["server_id"],
            "description":"Price per unit and listing count. NOT completed sales.",
            "snapshots": compact_snapshots(existing, created)}


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    os.replace(tmp, path)


def main():
    parser = argparse.ArgumentParser(description="Capture all publicly listed AION 2 items for one confirmed world")
    parser.add_argument("--fixture", help="Use local JSON fixture instead of the network (for testing only)")
    args = parser.parse_args()
    server_id = os.environ.get("MARKET_SERVER_ID", "11507").strip()
    if not server_id.isdigit():
        raise SystemExit("MARKET_SERVER_ID must be numeric")
    # Verified through aion2.exchange /api/servers on 2026-10-27.
    if not args.fixture and os.environ.get("CONFIRM_FREGION_SERVER_ID") != server_id:
        raise SystemExit("Safety stop: confirm the actual Asia/Fregion/Elyos ID through the source, then match CONFIRM_FREGION_SERVER_ID")
    if not args.fixture and os.environ.get("MARKET_SOURCE_PERMISSION_CONFIRMED") != "true":
        raise SystemExit("Safety stop: check the source policy / obtain required permission; set MARKET_SOURCE_PERMISSION_CONFIRMED=true only if allowed")
    if args.fixture:
        raw = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
        raw_items = raw["items"] if isinstance(raw, dict) else raw
    else:
        verify_fregion(server_id)
        raw_items = pull_items(server_id)
    created = utc_now()
    latest = latest_snapshot(raw_items, server_id, created)
    if args.fixture:
        latest["demo"] = True
        latest["source"] = "OFFLINE FIXTURE - NOT REAL MARKET DATA"
    history_file = DATA / "history.json"
    history = json.loads(history_file.read_text(encoding="utf-8")) if history_file.exists() else {}
    if history.get("snapshots") and str(history.get("server_id")) != server_id:
        raise RuntimeError("History was collected from another server ID; refusing to mix servers")
    if history.get("snapshots") and bool(history.get("demo", False)) != bool(args.fixture):
        raise RuntimeError("Refusing to merge fixture/demo and real market history")
    updated = update_history(history, latest, created)
    if args.fixture:
        updated["demo"] = True
    atomic_json(DATA / "latest.json", latest)
    atomic_json(history_file, updated)
    print(f"Saved {len(latest['items'])} items; {len(updated['snapshots'])} snapshots; captured at {latest['ts']}")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"COLLECTOR STOPPED: {exc}", file=sys.stderr)
        sys.exit(1)
