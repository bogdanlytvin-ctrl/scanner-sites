"""Build country-wide business tiles from a Geofabrik/OSM France .osm.pbf extract.

Usage (requires pyosmium): python scripts/build-osm-tiles.py ukraine-latest.osm.pbf out-dir
Writes out-dir/tiles/<lat>_<lng>.json (1°×1° cells, same "groups" format as the city
snapshots) and out-dir/index.json listing the tiles. The data is
© OpenStreetMap contributors, ODbL 1.0.
"""
import argparse
import base64
from collections import defaultdict
import gzip
import json
import math
from pathlib import Path

import osmium

# Same categories as build-osm-snapshot.py, with more customer-facing amenities.
CATEGORIES = {"amenity", "shop", "craft", "office", "tourism", "leisure", "healthcare"}
AMENITIES = set("""restaurant cafe fast_food bar pub ice_cream food_court biergarten dentist veterinary
pharmacy doctors clinic bank bureau_de_change money_transfer car_wash car_rental fuel driving_school
language_school music_school dancing_school prep_school kindergarten childcare cinema theatre nightclub
karaoke_box hookah_lounge internet_cafe coworking_space events_venue studio marketplace animal_boarding
bicycle_rental boat_rental vehicle_inspection public_bath""".split())
FIELDS = CATEGORIES | set("""name name:uk name:en cuisine website contact:website url phone contact:phone
contact:mobile email contact:email contact:facebook contact:instagram contact:telegram opening_hours
addr:street addr:housenumber addr:city addr:town addr:village addr:postcode""".split())
PRIMARY = ("shop", "amenity", "healthcare", "craft", "office", "tourism", "leisure")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf")
    parser.add_argument("out")
    parser.add_argument("--source", default="https://download.geofabrik.de/europe/ukraine-latest.osm.pbf")
    parser.add_argument("--min-records", type=int, default=100_000)
    args = parser.parse_args()

    processor = (osmium.FileProcessor(args.pbf)
                 .with_locations("flex_mem")
                 .with_filter(osmium.filter.KeyFilter(*PRIMARY)))
    timestamp = processor.header.get("osmosis_replication_timestamp")
    if not timestamp:
        raise ValueError("The extract must supply its map timestamp")

    tiles = defaultdict(lambda: defaultdict(list))
    for obj in processor:
        if not (obj.is_node() or obj.is_way()) or "name" not in obj.tags:
            continue
        primary = next((k for k in PRIMARY if k in obj.tags), None)
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
        tags = {t.k: t.v for t in obj.tags if t.k in FIELDS}
        if "url" in tags and "website" not in tags and "contact:website" not in tags:
            tags["website"] = tags["url"]
        tags.pop("url", None)
        indexes = {k: tags[k] for k in sorted(CATEGORIES) if k in tags}
        cell = f"{math.floor(lat)}_{math.floor(lon)}"
        key = json.dumps(indexes, ensure_ascii=False, separators=(",", ":"))
        tiles[cell][key].append([obj.type_str(), obj.id, round(lat, 6), round(lon, 6), tags])

    total = sum(len(rows) for groups in tiles.values() for rows in groups.values())
    if total < args.min_records:
        raise ValueError(f"Refusing to publish an incomplete directory ({total} records)")

    out = Path(args.out)
    (out / "tiles").mkdir(parents=True, exist_ok=True)
    index = {}
    for cell, groups in sorted(tiles.items()):
        items = {}
        for key, rows in sorted(groups.items()):
            payload = json.dumps(rows, separators=(",", ":"), ensure_ascii=False).encode()
            items[key] = base64.b64encode(gzip.compress(payload, mtime=0)).decode()
        count = sum(map(len, groups.values()))
        doc = {"city": "tile:" + cell, "asOf": timestamp, "sourceUrl": args.source,
               "license": "© OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright",
               "groups": items}
        (out / "tiles" / f"{cell}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
        index[cell] = count
    (out / "index.json").write_text(json.dumps({"asOf": timestamp, "records": total, "tiles": index}, indent=1))
    print(f"{total} records in {len(index)} tiles, map date {timestamp}")


if __name__ == "__main__":
    main()
