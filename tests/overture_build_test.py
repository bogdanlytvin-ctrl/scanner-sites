"""Unit tests for scripts/build-overture-tiles.py (run: python3 -I tests/overture_build_test.py)."""
import importlib.util, pathlib, unittest
spec = importlib.util.spec_from_file_location("b", pathlib.Path(__file__).parent.parent / "scripts" / "build-overture-tiles.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

def row(**kw):
    base = {"country": "UA", "name": "Посмішка", "status": None, "phones": ["+380671112233"], "websites": None, "socials": None,
            "emails": None, "confidence": 0.8, "cat": "dental_clinic", "hier": ["health_care", "outpatient_care_facility", "dental_clinic"],
            "addr": "вул. Січеславська 1", "locality": "Дніпро"}
    base.update(kw); return base

class Build(unittest.TestCase):
    def test_keep(self):
        self.assertTrue(b.keep(row()))
        self.assertFalse(b.keep(row(name="вул. Котляревського, 1")))
        self.assertFalse(b.keep(row(name="Вулиця Шевченка 5")))
        self.assertFalse(b.keep(row(name="12")))
        self.assertFalse(b.keep(row(country="RO")))
        self.assertFalse(b.keep(row(status="permanently_closed")))
        self.assertFalse(b.keep(row(phones=["+79781234567"])), "occupied areas")
        self.assertTrue(b.keep(row(phones=["+79781234567", "+380501112233"])))
        self.assertFalse(b.keep(row(confidence=0.2)))
        self.assertTrue(b.keep(row(confidence=0.35)))
        self.assertFalse(b.keep(row(confidence=0.35, phones=None)))
        self.assertTrue(b.keep(row(name="Вулик")), "a word that merely starts like a street")

    def test_tags(self):
        t = b.place_tags(row(websites=["https://posmishka.ua/", "https://instagram.com/posmishka"], socials=["https://www.facebook.com/1"]))
        self.assertEqual((t["amenity"], t["healthcare"], t["website"]), ("dentist", "dentist", "https://posmishka.ua/"))
        self.assertEqual(t["contact:instagram"], "https://instagram.com/posmishka")
        self.assertEqual(t["contact:facebook"], "https://www.facebook.com/1")
        pizza = b.place_tags(row(cat="pizza_restaurant", hier=["food_and_drink", "restaurant", "european_restaurant", "italian_restaurant", "pizza_restaurant"]))
        self.assertEqual((pizza["amenity"], pizza["cuisine"]), ("restaurant", "pizza"))
        barber = b.place_tags(row(cat="barber", hier=["lifestyle_services", "personal_or_beauty_service", "barber"]))
        self.assertEqual(barber["shop"], "hairdresser")
        self.assertIsNone(b.place_tags(row(cat="park", hier=["sports_and_recreation", "park"])) if "sports_and_recreation" not in b.TAGS else None)
        self.assertIsNone(b.place_tags(row(cat=None, hier=None)))

unittest.main(verbosity=1)
