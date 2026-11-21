"""Build Ukraine business tiles from Overture Maps Places (second source next to OpenStreetMap).

Usage (requires duckdb): python scripts/build-overture-tiles.py out-dir [--release 2026-11-18.0] [--parquet local.parquet]
Writes out-dir/tiles/<lat>_<lng>.json in the same "groups" format as the OSM tiles, with
Overture categories translated to OSM-style tags so the same niche search works on both.
Rows are ["o", "<overture id>", lat, lng, tags]. Data: Overture Maps Foundation, CDLA-Permissive-2.0.
"""
import argparse
import base64
import gzip
import json
import math
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
BBOX = (22.0, 44.3, 40.3, 52.4)  # Ukraine, with margin; rows are then limited to country UA
CATEGORIES = {"amenity", "shop", "craft", "office", "tourism", "leisure", "healthcare"}

# Overture taxonomy node -> OSM-style tags. The most specific node of a place's
# hierarchy that is listed here wins (pizza_restaurant -> ... -> restaurant).
DENTIST = {"amenity": "dentist", "healthcare": "dentist"}
TAGS = {
    # health
    "dental_clinic": DENTIST, "general_dentistry": DENTIST, "pediatric_dentistry": DENTIST, "orthodontist": DENTIST,
    "cosmetic_dentist": DENTIST, "oral_surgeon": DENTIST, "dentist": DENTIST, "endodontist": DENTIST, "periodontist": DENTIST,
    "veterinarian": {"amenity": "veterinary"}, "animal_hospital": {"amenity": "veterinary"},
    "pharmacy": {"amenity": "pharmacy"}, "hospital": {"amenity": "hospital"},
    "doctors_office": {"amenity": "doctors"}, "outpatient_care_facility": {"amenity": "clinic"},
    "primary_care_or_general_clinic": {"amenity": "clinic"}, "medical_center": {"amenity": "clinic"},
    "diagnostics_imaging_or_lab_service": {"amenity": "clinic"}, "laboratory_testing": {"amenity": "clinic"},
    "specialized_health_care": {"amenity": "clinic"}, "vision_or_eye_care_clinic": {"amenity": "clinic"},
    "physical_medicine_and_rehabilitation": {"amenity": "clinic"}, "reproductive_perinatal_and_womens_care": {"amenity": "clinic"},
    "psychology": {"healthcare": "psychotherapist", "office": "psychologist"},
    "behavioral_or_mental_health_clinic": {"healthcare": "psychotherapist"},
    "speech_therapist": {"healthcare": "speech_therapist"},
    # beauty & wellness
    "beauty_salon": {"shop": "beauty"}, "nail_salon": {"shop": "beauty"}, "skin_care_and_makeup": {"shop": "beauty"},
    "laser_hair_removal": {"shop": "beauty"}, "eyelash_service": {"shop": "beauty"}, "personal_or_beauty_service": {"shop": "beauty"},
    "hair_salon": {"shop": "hairdresser"}, "barber": {"shop": "hairdresser"},
    "spa": {"leisure": "spa"}, "massage_therapy": {"shop": "massage"}, "massage": {"shop": "massage"},
    "tattoo_and_piercing": {"shop": "tattoo"}, "sauna": {"leisure": "sauna"}, "bathhouse": {"amenity": "public_bath"},
    # food & drink
    "restaurant": {"amenity": "restaurant"}, "pizza_restaurant": {"amenity": "restaurant", "cuisine": "pizza"},
    "sushi_restaurant": {"amenity": "restaurant", "cuisine": "sushi"}, "burger_restaurant": {"amenity": "restaurant", "cuisine": "burger"},
    "fast_food_restaurant": {"amenity": "fast_food"}, "casual_eatery": {"amenity": "fast_food"},
    "cafe": {"amenity": "cafe"}, "coffee_shop": {"amenity": "cafe", "cuisine": "coffee_shop"}, "dessert_shop": {"amenity": "cafe"},
    "bar": {"amenity": "bar"}, "cocktail_bar": {"amenity": "bar"}, "beer_bar": {"amenity": "bar"}, "wine_bar": {"amenity": "bar"},
    "lounge": {"amenity": "bar"}, "pub": {"amenity": "pub"}, "gastropub": {"amenity": "pub"},
    "hookah_bar": {"amenity": "hookah_lounge"}, "dance_club": {"amenity": "nightclub"}, "karaoke_venue": {"amenity": "karaoke_box"},
    "brewery": {"craft": "brewery", "microbrewery": "yes"}, "bakery": {"shop": "bakery"}, "candy_store": {"shop": "confectionery"},
    "butcher_shop": {"shop": "butcher"}, "liquor_store": {"shop": "alcohol"}, "food_delivery_service": {"amenity": "fast_food"},
    "caterer": {"craft": "caterer"},
    # lodging
    "hotel": {"tourism": "hotel"}, "resort": {"tourism": "hotel"}, "lodging": {"tourism": "hotel"}, "inn": {"tourism": "hotel"},
    "motel": {"tourism": "motel"}, "hostel": {"tourism": "hostel"}, "bed_and_breakfast": {"tourism": "guest_house"},
    "guest_house": {"tourism": "guest_house"}, "holiday_rental_home": {"tourism": "apartment"}, "private_lodging": {"tourism": "apartment"},
    # sport
    "gym": {"leisure": "fitness_centre"}, "fitness_studio": {"leisure": "fitness_centre"}, "yoga_studio": {"leisure": "fitness_centre"},
    "pilates_studio": {"leisure": "fitness_centre"}, "martial_arts_club": {"leisure": "fitness_centre"},
    "sport_or_fitness_facility": {"leisure": "sports_centre"}, "dance_studio": {"leisure": "dance", "amenity": "dancing_school"},
    "swimming_pool": {"leisure": "swimming_pool"}, "bowling_alley": {"leisure": "bowling_alley"}, "escape_room": {"leisure": "escape_game"},
    # cars
    "automotive_repair": {"shop": "car_repair", "craft": "car_repair"}, "automotive_service": {"shop": "car_repair"},
    "auto_body_shop": {"shop": "car_repair"}, "vehicle_service": {"shop": "car_repair"}, "tire_dealer_and_repair": {"shop": "tyres"},
    "car_wash": {"amenity": "car_wash"}, "auto_detailing": {"amenity": "car_wash"}, "auto_parts_store": {"shop": "car_parts"},
    "vehicle_parts_store": {"shop": "car_parts"}, "auto_dealer": {"shop": "car"}, "car_rental_service": {"amenity": "car_rental"},
    "gas_station": {"amenity": "fuel"}, "fueling_station": {"amenity": "fuel"}, "driving_school": {"amenity": "driving_school"},
    # offices & services
    "attorney_or_law_firm": {"office": "lawyer"}, "legal_service": {"office": "lawyer"}, "lawyer": {"office": "lawyer"},
    "notary": {"office": "notary"}, "notary_public": {"office": "notary"}, "accountant": {"office": "accountant"},
    "accounting_service": {"office": "accountant"}, "tax_service": {"office": "accountant"}, "insurance_agency": {"office": "insurance"},
    "real_estate_service": {"office": "estate_agent"}, "real_estate_agent": {"office": "estate_agent"},
    "travel_service": {"office": "travel_agent"}, "tour_operator": {"office": "travel_agent"}, "travel_agency": {"office": "travel_agent"},
    "advertising_agency": {"office": "advertising_agency"}, "marketing_agency": {"office": "advertising_agency"},
    "internet_marketing_service": {"office": "advertising_agency"}, "b2b_advertising_and_marketing_service": {"office": "advertising_agency"},
    "software_development": {"office": "it"}, "information_technology_company": {"office": "it"}, "web_designer": {"office": "it"},
    "it_service_and_computer_repair": {"shop": "electronics_repair", "office": "it"}, "architectural_designer": {"office": "architect"},
    "employment_agency": {"office": "employment_agency"}, "coworking_space": {"amenity": "coworking_space"},
    "translating_and_interpreting_service": {"office": "translator"}, "event_photography_service": {"craft": "photographer"},
    "photographer": {"craft": "photographer"}, "printing_service": {"shop": "copyshop", "craft": "printer"},
    "sewing_and_alterations": {"shop": "tailor", "craft": "tailor"}, "dry_cleaning": {"shop": "dry_cleaning"},
    "laundry_service": {"shop": "laundry"}, "appliance_repair_service": {"craft": "electronics_repair"},
    "windows_installation": {"craft": "window_construction"}, "hvac_service": {"craft": "hvac"},
    "contractor": {"craft": "builder"}, "building_or_construction_service": {"craft": "builder"}, "plumber": {"craft": "plumber"},
    "electrician": {"craft": "electrician"}, "locksmith": {"craft": "locksmith"}, "cleaning_service": {"craft": "cleaning"},
    "interior_design": {"shop": "interior_decoration"}, "funeral_service": {"shop": "funeral_directors"}, "pet_groomer": {"shop": "pet_grooming"},
    "professional_service": {"office": "company"}, "home_service": {"craft": "yes"},
    # education & leisure
    "language_school": {"amenity": "language_school", "school": "language"}, "music_school": {"amenity": "music_school"},
    "preschool": {"amenity": "kindergarten"}, "day_care_preschool": {"amenity": "kindergarten"}, "art_school": {"amenity": "school"},
    "movie_theater": {"amenity": "cinema"}, "theatre_venue": {"amenity": "theatre"}, "museum": {"tourism": "museum"},
    # shops
    "florist": {"shop": "florist"}, "flowers_and_gifts_store": {"shop": "florist"}, "clothing_store": {"shop": "clothes"},
    "fashion_and_apparel_store": {"shop": "clothes"}, "fashion_boutique": {"shop": "clothes"}, "shoe_store": {"shop": "shoes"},
    "jewelry_store": {"shop": "jewelry"}, "eyewear_store": {"shop": "optician"}, "optician": {"shop": "optician"},
    "furniture_store": {"shop": "furniture"}, "grocery_store": {"shop": "supermarket"}, "convenience_store": {"shop": "convenience"},
    "pet_store": {"shop": "pet"}, "electronics_store": {"shop": "electronics"}, "mobile_phone_store": {"shop": "mobile_phone"},
    "computer_store": {"shop": "computer"}, "bookstore": {"shop": "books"}, "toy_store": {"shop": "toys"},
    "hardware_store": {"shop": "hardware"}, "home_improvement_store": {"shop": "doityourself"}, "building_supply_store": {"shop": "doityourself"},
    "sporting_goods_store": {"shop": "sports"}, "bike_store": {"shop": "bicycle"}, "cosmetics_and_fragrance_store": {"shop": "cosmetics"},
    "beauty_supply_store": {"shop": "cosmetics"}, "fabric_store": {"shop": "fabric"}, "appliance_store": {"shop": "appliance"},
    "pawn_shop": {"shop": "pawnbroker"}, "stationery_store": {"shop": "stationery"}, "gift_shop": {"shop": "gift"},
    "home_goods_store": {"shop": "houseware"}, "carpet_store": {"shop": "carpet"}, "lighting_store": {"shop": "lighting"},
    "wine_store": {"shop": "wine"}, "tobacco_shop": {"shop": "tobacco"}, "door_store": {"shop": "doors"},
    # broad roots: still searchable by name in a broad search
    "shopping": {"shop": "yes"}, "services_and_business": {"office": "company"}, "food_and_drink": {"amenity": "restaurant"},
}
SOCIAL = re.compile(r"(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|t\.me|telegram\.me|tiktok\.com|youtube\.com|vk\.com|linktr\.ee|wa\.me)$", re.I)


def osm_tags(hierarchy, primary):
    path = list(hierarchy) if hierarchy else ([primary] if primary else [])
    for node in reversed(path):
        if node in TAGS:
            return dict(TAGS[node])
    return None


def host(url):
    m = re.match(r"^(?:https?://)?([^/?#:]+)", url or "", re.I)
    return (m.group(1).lower().removeprefix("www.") if m else "")


def place_tags(row):
    tags = osm_tags(row["hier"], row["cat"])
    if not tags:
        return None
    tags["name"] = row["name"].strip()
    sites, social = [], {}
    for url in list(row["websites"] or []) + list(row["socials"] or []):
        h = host(url)
        if not h:
            continue
        if SOCIAL.search(h):
            key = "contact:instagram" if "instagram" in h else "contact:telegram" if h in ("t.me", "telegram.me") else "contact:facebook" if "fb" in h or "facebook" in h else None
            if key and key not in social:
                social[key] = url
        elif url not in sites:
            sites.append(url)
    if sites:
        tags["website"] = sites[0]
    tags.update(social)
    if row["phones"]:
        tags["phone"] = row["phones"][0]
    if row["emails"]:
        tags["email"] = row["emails"][0]
    if row["addr"]:
        tags["addr:street"] = row["addr"]
    if row["locality"]:
        tags["addr:city"] = row["locality"]
    tags["source"] = "overture"
    return tags


# Holiday flats are often named by their address ("вул. Котляревського, 1"): not a business name.
ADDRESS_NAME = re.compile(r"^\s*(вул\.?|вулиця|ул\.?|улица|просп\.?|проспект|пр-т|пров\.?|провулок|бульв\.?|бульвар|площа|пл\.|шосе|str\.?|street|ul\.)\s", re.I)


def keep(row):
    name = (row["name"] or "").strip()
    if row["country"] != "UA" or not name or ADDRESS_NAME.match(name) or not re.search(r"[^\W\d_]", name):
        return False
    if row["status"] in ("permanently_closed", "temporarily_closed"):
        return False
    phones = row["phones"] or []
    # Places only reachable on Russian numbers are in occupied areas: not our market.
    if phones and all(p.replace(" ", "").startswith("+7") for p in phones):
        return False
    reachable = bool(phones or row["websites"] or row["socials"] or row["emails"])
    conf = row["confidence"] or 0
    # Meta's low-confidence places are often stale; keep them only when there is a way to reach them.
    return conf >= 0.5 or (conf >= 0.3 and reachable)


def latest_release():
    with urllib.request.urlopen(BUCKET + "/?list-type=2&prefix=release/&delimiter=/", timeout=30) as r:
        releases = re.findall(r"release/(\d{4}-\d{2}-\d{2}\.\d+)/", r.read().decode())
    if not releases:
        raise SystemExit("No Overture release found")
    return sorted(releases)[-1]


def read_rows(release, parquet):
    import duckdb
    con = duckdb.connect()
    con.execute("SET memory_limit='2GB'")
    if parquet:
        source = f"read_parquet('{parquet}')"
        query = f"SELECT * FROM {source}"
    else:
        con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'")
        source = f"read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*', hive_partitioning=1)"
        x0, y0, x1, y1 = BBOX
        query = f"""SELECT id, names.primary AS name, taxonomy.primary AS cat, taxonomy.hierarchy AS hier,
            operating_status AS status, websites, phones, socials, emails, addresses[1].freeform AS addr,
            addresses[1].locality AS locality, addresses[1].country AS country, confidence,
            (bbox.xmin + bbox.xmax) / 2 AS lon, (bbox.ymin + bbox.ymax) / 2 AS lat
            FROM {source} WHERE bbox.xmin BETWEEN {x0} AND {x1} AND bbox.ymin BETWEEN {y0} AND {y1}"""
    cur = con.execute(query)
    cols = [d[0] for d in cur.description]
    while True:
        batch = cur.fetchmany(50_000)
        if not batch:
            break
        for values in batch:
            yield dict(zip(cols, values))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out")
    parser.add_argument("--release")
    parser.add_argument("--parquet", help="read a local extract instead of S3 (tests)")
    parser.add_argument("--min-records", type=int, default=100_000)
    args = parser.parse_args()
    release = args.release or ("local" if args.parquet else latest_release())

    tiles = defaultdict(lambda: defaultdict(list))
    total = 0
    for row in read_rows(release, args.parquet):
        if not keep(row):
            continue
        tags = place_tags(row)
        if not tags:
            continue
        lat, lon = round(row["lat"], 6), round(row["lon"], 6)
        index = {k: tags[k] for k in sorted(CATEGORIES) if k in tags}
        key = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
        tiles[f"{math.floor(lat)}_{math.floor(lon)}"][key].append(["o", row["id"], lat, lon, tags])
        total += 1
    if total < args.min_records:
        raise SystemExit(f"Refusing to publish an incomplete directory ({total} records)")

    as_of = release.split(".")[0] + "T00:00:00Z" if release != "local" else "1970-01-01T00:00:00Z"
    out = Path(args.out)
    (out / "tiles").mkdir(parents=True, exist_ok=True)
    index = {}
    for cell, groups in sorted(tiles.items()):
        items = {}
        for key, rows in sorted(groups.items()):
            payload = json.dumps(rows, separators=(",", ":"), ensure_ascii=False).encode()
            items[key] = base64.b64encode(gzip.compress(payload, mtime=0)).decode()
        doc = {"city": "tile:" + cell, "asOf": as_of, "release": release,
               "sourceUrl": "https://overturemaps.org/", "license": "Overture Maps Foundation, CDLA-Permissive-2.0", "groups": items}
        (out / "tiles" / f"{cell}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
        index[cell] = sum(map(len, groups.values()))
    (out / "index.json").write_text(json.dumps({"asOf": as_of, "release": release, "records": total, "tiles": index}, indent=1))
    print(f"{total} records in {len(index)} tiles, Overture release {release}", file=sys.stderr)


if __name__ == "__main__":
    main()
