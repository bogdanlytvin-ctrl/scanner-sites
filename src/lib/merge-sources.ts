// Two directories of the same businesses (OpenStreetMap and Overture Maps) merged into one list
// without duplicates. OSM stays the primary record (its ids keep saved cards and statuses stable);
// Overture fills the gaps it knows (phone, website, socials) and adds the places OSM lacks.

export type Place = {
  osmId: string; name: string; phone: string; website: string; address: string; email: string;
  facebook: string; instagram: string; telegram: string; socialOnly: boolean; lat: number; lng: number;
  sources?: string[];
};

const LATIN: Record<string, string> = { а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ё: "e", ы: "y", э: "e", ъ: "" };
// Words that say what the place is, not which one it is: "Стоматологія «Посмішка»" ≈ "Посмішка".
const GENERIC = new Set(("стоматологія стоматологическая стоматология стоматологічна стоматологічний клініка клиника центр салон краси красоты " +
  "студія студия готель гостиница отель hotel hostel хостел кафе ресторан бар піцерія пиццерия магазин аптека автосервіс автосервис сто " +
  "dental dent clinic studio salon beauty cafe restaurant bar shop store the and центр медичний медицинский приватна частная тов фоп ооо пп " +
  "барбершоп барбер barbershop barber студія студио епіляції эпиляции лазерна лазерная лазерної спа spa " +
  // City names in a business name ("Естетика Дніпро") say nothing about which place it is.
  "дніпро днепр dnipro київ киев kyiv kiev львів львов lviv одеса одесса odesa odessa харків харьков kharkiv запоріжжя запорожье " +
  "вінниця винница чернівці черновцы полтава ужгород тернопіль житомир рівне луцьк херсон миколаїв суми чернігів черкаси").split(" "));

const ascii = (word: string) => [...word].map(ch => LATIN[ch] ?? ch).join("")
  // Spelling drift between Ukrainian and Russian transliterations: и/і/ы, г/h/g, kh/h.
  .replace(/kh/g, "h").replace(/g/g, "h").replace(/[yi]/g, "i").replace(/ie/g, "e").replace(/[^a-z0-9]/g, "");

export function nameKey(name: string): string {
  const words = name.toLowerCase().normalize("NFKC").replace(/['’ʼ`‘"«»“”]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const distinctive = words.filter(w => !GENERIC.has(w));
  return (distinctive.length ? distinctive : words).map(ascii).join("");
}

/** "Стоматологія", "Клініка стоматології": only generic words, so the name alone proves nothing. */
const genericOnly = (name: string) =>
  name.toLowerCase().normalize("NFKC").replace(/['’ʼ`‘"«»“”]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    .every(w => GENERIC.has(w) || /^(стоматолог|клінік|клиник|салон|готел|гостиниц|кафе|ресторан|аптек|магазин)/.test(w));

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

export function similarNames(a: string, b: string): boolean {
  if (genericOnly(a) || genericOnly(b)) return false;
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return false;
  // "вул. Дюківська, 8" and "вул. Дюківська, 14" are two places.
  if ((x.match(/\d+/g) || []).join(",") !== (y.match(/\d+/g) || []).join(",")) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 5 && (long.startsWith(short) || long.endsWith(short))) return true;
  // Short names (MVD / VD, Ліра / Лора) must match exactly; longer ones may differ by a letter per five.
  return short.length >= 4 && Math.abs(x.length - y.length) <= 2 && editDistance(x, y) <= Math.max(1, Math.floor(long.length / 5));
}

const digits = (phone: string) => (phone || "").replace(/\D/g, "").slice(-9);
const known = (v: string) => Boolean(v && v !== "N/A");
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|t\.me|telegram\.me|tiktok\.com|youtube\.com|vk\.com|linktr\.ee|wa\.me)$/i;
function siteHost(url: string): string {
  if (!known(url)) return "";
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : "https://" + url).hostname.toLowerCase().replace(/^www\./, "");
    return SOCIAL.test(host) ? "" : host;
  } catch { return ""; }
}

function metres(a: Place, b: Place): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
}

/**
 * Same business? Name alike and within 150 m (the two maps place a pin differently), or the same
 * phone / own website within 300 m. A chain's branches share a name and phone but stand further
 * apart, so they stay separate (grouping branches is done later, on purpose).
 */
export function samePlace(a: Place, b: Place): boolean {
  const d = metres(a, b);
  if (d > 600) return false;
  const name = similarNames(a.name, b.name);
  const phone = digits(a.phone).length === 9 && digits(a.phone) === digits(b.phone);
  const site = siteHost(a.website) !== "" && siteHost(a.website) === siteHost(b.website);
  // Long distinctive names are safe a little further apart (map pins from Facebook pages drift).
  if (name && (d <= 150 || (d <= 300 && Math.min(nameKey(a.name).length, nameKey(b.name).length) >= 6))) return true;
  if ((phone || site) && d <= 300) return true;
  // Pins from Facebook pages can sit a few hundred metres off: name + phone/site together is still sure.
  return name && (phone || site);
}

/** Fill what the primary record lacks. A real website from either source means "has a site". */
function absorb(into: Place, from: Place) {
  for (const field of ["phone", "address", "email", "facebook", "instagram", "telegram"] as const)
    if (!known(into[field]) && known(from[field])) into[field] = from[field];
  if (!known(into.website) && known(from.website)) into.website = from.website;
  into.socialOnly = !known(into.website) && Boolean(into.facebook || into.instagram || into.telegram);
  into.sources = [...new Set([...(into.sources || []), ...(from.sources || [])])];
}

const cellOf = (p: Place) => `${Math.floor(p.lat * 100)}:${Math.floor(p.lng * 100)}`;

/** Merge `extra` into `primary`: matched places enrich the primary record, the rest are added. */
export function mergeSources<T extends Place>(primary: T[], extra: T[]): T[] {
  const result: T[] = [];
  // ~1 km grid so each place is compared only with its neighbours.
  const grid = new Map<string, T[]>();
  const put = (p: T) => { const k = cellOf(p); (grid.get(k) || grid.set(k, []).get(k)!).push(p); };
  const near = (p: T) => {
    const y = Math.floor(p.lat * 100), x = Math.floor(p.lng * 100), out: T[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(...(grid.get(`${y + dy}:${x + dx}`) || []));
    return out;
  };
  // OSM sometimes holds one place twice (a point and the building outline, a second point). Mappers place
  // branches precisely, so inside OSM only a near-identical spot (≤ 60 m) with a similar name is a duplicate.
  for (const place of primary) {
    const record = { ...place, sources: place.sources || ["osm"] };
    // Different phones or sites mean two branches standing side by side, not one place mapped twice.
    const conflict = (p: Place) => (digits(p.phone).length === 9 && digits(record.phone).length === 9 && digits(p.phone) !== digits(record.phone))
      || (siteHost(p.website) !== "" && siteHost(record.website) !== "" && siteHost(p.website) !== siteHost(record.website));
    const twin = near(record).find(p => metres(p, record) <= 60 && similarNames(p.name, record.name) && !conflict(p));
    if (twin) absorb(twin, record);
    else { result.push(record); put(record); }
  }
  for (const place of extra) {
    const incoming = { ...place, sources: place.sources || ["overture"] };
    // Best match: the closest similar record (OSM first, then Overture places already added).
    const match = near(incoming).filter(p => samePlace(p, incoming)).sort((a, b) => metres(a, incoming) - metres(b, incoming))[0];
    if (match) absorb(match, incoming);
    else { result.push(incoming as T); put(incoming as T); }
  }
  return result as T[];
}
