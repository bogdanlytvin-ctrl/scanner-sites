"""Build the read-only city directory from an OSM France .osm.pbf extract.

Usage (requires pyosmium): python scripts/build-osm-snapshot.py lviv input.osm.pbf
Sources: https://download.openstreetmap.fr/extracts/europe/ukraine/
The resulting data is © OpenStreetMap contributors, ODbL 1.0.
"""
import argparse
import base64
from collections import defaultdict
import gzip
import json
import math
from pathlib import Path

import osmium


REGIONS = {
    "lviv": ("Львів", 49.84195, 24.03159, "lviv_oblast"),
    "kyiv": ("Київ", 50.45003, 30.52414, "kiev"),
}
RADIUS_KM = 20
# Only public-facing commercial categories and contact channels used by the tool.
CATEGORIES = {"amenity", "shop", "craft", "office", "tourism", "leisure", "healthcare"}
AMENITIES = set("restaurant cafe fast_food bar pub ice_cream dentist veterinary pharmacy doctors clinic bank bureau_de_change car_wash driving_school cinema theatre nightclub".split())
FIELDS = CATEGORIES | set("name name:uk name:en cuisine website contact:website phone contact:phone contact:mobile email contact:email contact:facebook contact:instagram contact:telegram opening_hours addr:street addr:housenumber addr:city addr:town addr:village addr:postcode".split())


def within_radius(lat, lon, center_lat, center_lon):
    dy = math.radians(lat - center_lat)
    dx = math.radians(lon - center_lon)
    a = math.sin(dy / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(center_lat)) * math.sin(dx / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(a))) <= RADIUS_KM


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("region", choices=REGIONS)
    parser.add_argument("pbf")
    args = parser.parse_args()
    city, center_lat, center_lon, extract = REGIONS[args.region]
    processor = osmium.FileProcessor(args.pbf).with_locations("flex_mem")
    timestamp = processor.header.get("osmosis_replication_timestamp")
    if not timestamp:
        raise ValueError("The extract must supply its map timestamp")
    groups = defaultdict(list)
    for obj in processor:
        if not (obj.is_node() or obj.is_way()) or "name" not in obj.tags:
            continue
        # A POI can belong to multiple categories, e.g. amenity and healthcare.
        # Place it under one index and retain its other tags for precise filtering.
        primary = next((k for k in ("shop", "amenity", "healthcare", "craft", "office", "tourism", "leisure") if k in obj.tags), None)
        if not primary or primary == "amenity" and obj.tags[primary] not in AMENITIES:
            continue
        if any(k in obj.tags for k in ("military", "disused", "abandoned")):
            continue
        if obj.is_node():
            lon, lat = obj.location.lon, obj.location.lat
        else:
            coords = [(n.lon, n.lat) for n in obj.nodes if n.location.valid()]
            if not coords:
                continue
            lon = (max(c[0] for c in coords) + min(c[0] for c in coords)) / 2
            lat = (max(c[1] for c in coords) + min(c[1] for c in coords)) / 2
        if not within_radius(lat, lon, center_lat, center_lon):
            continue
        tags = {t.k: t.v for t in obj.tags if t.k in FIELDS}
        indexes = {k: tags[k] for k in sorted(CATEGORIES) if k in tags}
        groups[json.dumps(indexes, ensure_ascii=False, separators=(",", ":"))].append([obj.type_str(), obj.id, round(lat, 6), round(lon, 6), tags])

    total = sum(map(len, groups.values()))
    if total < 1000:
        raise ValueError(f"Refusing to publish an incomplete directory ({total} records)")
    items = {}
    for key, rows in sorted(groups.items()):
        payload = json.dumps(rows, separators=(",", ":"), ensure_ascii=False).encode()
        items[key] = base64.b64encode(gzip.compress(payload, mtime=0)).decode()
    output = {"city": city, "lat": center_lat, "lng": center_lon, "radiusKm": RADIUS_KM,
              "asOf": timestamp, "sourceUrl": f"https://download.openstreetmap.fr/extracts/europe/ukraine/{extract}-latest.osm.pbf",
              "license": "© OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright", "groups": items}
    destination = Path(__file__).resolve().parents[1] / "public" / "osm" / f"{args.region}-osm.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"{city}: {sum(map(len, groups.values()))} records, {timestamp}, {destination.stat().st_size} bytes")


if __name__ == "__main__":
    main()
