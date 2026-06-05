// OpenStreetMap integration — completely free, no API key needed
// Uses Nominatim for geocoding + Overpass API for business search
//
// Tested endpoints & queries — all verified working

export interface GeoCoords {
  lat: number;
  lng: number;
  displayName: string;
}

export interface OSMResult {
  name: string;
  phone: string;
  website: string;
  address: string;
  email: string;
  facebook: string;
  instagram: string;
  telegram: string;
  openingHours: string;
  description: string;
  lat: number;
  lng: number;
  type: string;
  // True when the business has a social presence (FB/IG/Telegram) but no real
  // website — the warmest prospect: already online, just needs a proper site.
  socialOnly: boolean;
}

// ─── Overpass endpoints (fallback chain) ────────────────────

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass.tru.vn.ua/api/interpreter",
  "https://overpass-api.de/api/interpreter", // most unreliable — last resort
];

// ─── Keyword → OSM tag mapping ───────────────────────────────

const KEYWORD_MAP: Record<string, string[]> = {
  // Food & Drink
  restaurant: ["amenity=restaurant"],
  ресторан: ["amenity=restaurant"],
  pizza: ["amenity=restaurant", "cuisine=pizza"],
  піцерія: ["amenity=restaurant", "cuisine=pizza"],
  cafe: ["amenity=cafe"],
  café: ["amenity=cafe"],
  кафе: ["amenity=cafe"],
  coffee: ["amenity=cafe", "cuisine=coffee_shop"],
  кавʼярня: ["amenity=cafe", "cuisine=coffee_shop"],
  bakery: ["shop=bakery"],
  пекарня: ["shop=bakery"],
  bar: ["amenity=bar"],
  бар: ["amenity=bar"],
  sushi: ["amenity=restaurant", "cuisine=sushi"],
  фастфуд: ["amenity=fast_food"],
  fast_food: ["amenity=fast_food"],
  food: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe"],
  їжа: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe"],
  пиво: ["amenity=bar", "microbrewery=yes"],
  beer: ["amenity=bar", "microbrewery=yes"],

  // Health
  dentist: ["amenity=dentist"],
  стоматолог: ["amenity=dentist"],
  doctor: ["amenity=doctors"],
  лікар: ["amenity=doctors"],
  pharmacy: ["amenity=pharmacy"],
  аптека: ["amenity=pharmacy"],
  hospital: ["amenity=hospital"],
  лікарня: ["amenity=hospital"],
  veterinary: ["amenity=veterinary"],
  ветлікарня: ["amenity=veterinary"],
  gym: ["leisure=fitness_centre"],
  спортзал: ["leisure=fitness_centre"],
  beauty: ["shop=beauty"],
  салон: ["shop=beauty", "shop=hairdresser"],
  hairdresser: ["shop=hairdresser"],
  перукарня: ["shop=hairdresser"],
  massage: ["shop=massage"],
  масаж: ["shop=massage"],
  nails: ["shop=beauty"],
  нігті: ["shop=beauty"],
  spa: ["leisure=spa"],

  // Home & Auto Services
  plumber: ["craft=plumber"],
  сантехнік: ["craft=plumber"],
  electrician: ["craft=electrician"],
  електрик: ["craft=electrician"],
  car_repair: ["craft=car_repair", "shop=car_repair"],
  сто: ["craft=car_repair", "shop=car_repair"],
  auto: ["craft=car_repair", "shop=car", "shop=car_repair"],
  locksmith: ["craft=locksmith"],
  painter: ["craft=painter"],
  маляр: ["craft=painter"],
  carpenter: ["craft=carpenter"],
  тесляр: ["craft=carpenter"],
  roofer: ["craft=roofer"],
  дахівець: ["craft=roofer"],

  // Professional Services
  lawyer: ["office=lawyer"],
  юрист: ["office=lawyer"],
  адвокат: ["office=lawyer"],
  адвокатура: ["office=lawyer"],
  юрфірма: ["office=lawyer"],
  правник: ["office=lawyer"],
  attorney: ["office=lawyer"],
  "law firm": ["office=lawyer"],
  adwokat: ["office=lawyer"],
  kancelaria: ["office=lawyer"],
  advokat: ["office=lawyer"],
  advokát: ["office=lawyer"],
  pravnik: ["office=lawyer"],
  accountant: ["office=accountant"],
  бухгалтер: ["office=accountant"],
  real_estate: ["office=estate_agent"],
  нерухомість: ["office=estate_agent"],
  insurance: ["office=insurance"],
  страхування: ["office=insurance"],
  bank: ["amenity=bank"],
  банк: ["amenity=bank"],
  notary: ["office=notary"],
  нотаріус: ["office=notary"],
  architect: ["office=architect"],
  архітектор: ["office=architect"],

  // Shopping
  clothes: ["shop=clothes"],
  одяг: ["shop=clothes"],
  supermarket: ["shop=supermarket"],
  супермаркет: ["shop=supermarket"],
  electronics: ["shop=electronics"],
  електроніка: ["shop=electronics"],
  flowers: ["shop=florist"],
  квіти: ["shop=florist"],
  bookstore: ["shop=books"],
  книжковий: ["shop=books"],
  shoes: ["shop=shoes"],
  взуття: ["shop=shoes"],
  jewelry: ["shop=jewelry"],
  ювелір: ["shop=jewelry"],
  optician: ["shop=optician"],
  оптик: ["shop=optician"],

  // Education
  school: ["amenity=school"],
  школа: ["amenity=school"],
  university: ["amenity=university"],
  університет: ["amenity=university"],
  kindergarten: ["amenity=kindergarten"],
  дитсадок: ["amenity=kindergarten"],
  courses: ["amenity=school", "school=language"],

  // Hotels & Tourism
  hotel: ["tourism=hotel"],
  готель: ["tourism=hotel"],
  hostel: ["tourism=hostel"],
  хостел: ["tourism=hostel"],
  travel: ["office=travel_agent"],
  турагенція: ["office=travel_agent"],

  // Fuel & Transport
  gas: ["amenity=fuel"],
  заправка: ["amenity=fuel"],
  parking: ["amenity=parking"],
  паркування: ["amenity=parking"],
  car_wash: ["amenity=car_wash"],
  мийка: ["amenity=car_wash"],

  // Religious
  church: ["amenity=place_of_worship"],
  церква: ["amenity=place_of_worship"],

  // ── Extended vocabulary (synonyms + niches) ──
  // Food & Drink
  pub: ["amenity=pub"],
  паб: ["amenity=pub"],
  їдальня: ["amenity=restaurant"],
  бістро: ["amenity=fast_food"],
  bistro: ["amenity=fast_food"],
  бургерна: ["amenity=fast_food", "cuisine=burger"],
  burger: ["amenity=fast_food", "cuisine=burger"],
  шаурма: ["amenity=fast_food"],
  шаверма: ["amenity=fast_food"],
  кондитерська: ["shop=confectionery", "shop=pastry"],
  кондитерка: ["shop=confectionery", "shop=pastry"],
  винарня: ["shop=wine", "amenity=bar"],
  wine: ["shop=wine"],
  пивна: ["amenity=pub", "amenity=bar"],

  // Health & Beauty
  clinic: ["amenity=clinic"],
  клініка: ["amenity=clinic"],
  медцентр: ["amenity=clinic"],
  косметолог: ["shop=beauty"],
  косметологія: ["shop=beauty"],
  манікюр: ["shop=beauty"],
  барбершоп: ["shop=hairdresser"],
  barbershop: ["shop=hairdresser"],
  тату: ["shop=tattoo"],
  tattoo: ["shop=tattoo"],
  оптика: ["shop=optician"],
  фітнес: ["leisure=fitness_centre"],
  спортклуб: ["leisure=fitness_centre"],

  // Auto
  автосервіс: ["craft=car_repair", "shop=car_repair"],
  автомийка: ["amenity=car_wash"],
  шиномонтаж: ["shop=tyres"],
  tyres: ["shop=tyres"],
  автозапчастини: ["shop=car_parts"],
  car_parts: ["shop=car_parts"],
  автосалон: ["shop=car"],
  автошкола: ["amenity=driving_school"],
  driving_school: ["amenity=driving_school"],

  // Home & Trades
  меблі: ["shop=furniture"],
  furniture: ["shop=furniture"],
  будматеріали: ["shop=doityourself", "shop=hardware"],
  hardware: ["shop=hardware"],
  будівельник: ["craft=builder"],
  builder: ["craft=builder"],
  ательє: ["shop=tailor", "craft=tailor"],
  кравець: ["craft=tailor"],
  tailor: ["craft=tailor"],
  хімчистка: ["shop=dry_cleaning", "shop=laundry"],
  пральня: ["shop=laundry"],
  laundry: ["shop=laundry"],

  // Professional / Creative
  реклама: ["office=advertising_agency"],
  фотограф: ["craft=photographer", "shop=photo"],
  photographer: ["craft=photographer"],
  фотостудія: ["craft=photographer", "shop=photo"],
  друкарня: ["shop=copyshop", "craft=printer"],
  типографія: ["shop=copyshop", "craft=printer"],
  copyshop: ["shop=copyshop"],
  it: ["office=it"],
  айті: ["office=it"],

  // Shopping
  продукти: ["shop=convenience", "shop=supermarket"],
  продуктовий: ["shop=convenience", "shop=supermarket"],
  мʼясо: ["shop=butcher"],
  butcher: ["shop=butcher"],
  риба: ["shop=seafood"],
  алкоголь: ["shop=alcohol"],
  alcohol: ["shop=alcohol"],
  зоомагазин: ["shop=pet"],
  pet: ["shop=pet"],
  іграшки: ["shop=toys"],
  toys: ["shop=toys"],
  косметика: ["shop=cosmetics", "shop=chemist"],
  cosmetics: ["shop=cosmetics"],
  парфуми: ["shop=perfumery"],
  спорттовари: ["shop=sports"],
  sports: ["shop=sports"],
  велосипеди: ["shop=bicycle"],
  bicycle: ["shop=bicycle"],
  телефони: ["shop=mobile_phone"],
  mobile: ["shop=mobile_phone"],
  компʼютери: ["shop=computer"],
  computer: ["shop=computer"],
  канцтовари: ["shop=stationery"],
  подарунки: ["shop=gift"],
  gift: ["shop=gift"],
  магазин: ["shop"],

  // Leisure & Culture
  басейн: ["leisure=swimming_pool"],
  боулінг: ["leisure=bowling_alley"],
  кінотеатр: ["amenity=cinema"],
  cinema: ["amenity=cinema"],
  театр: ["amenity=theatre"],
  theatre: ["amenity=theatre"],
  клуб: ["amenity=nightclub"],
  nightclub: ["amenity=nightclub"],
  музей: ["tourism=museum"],
  museum: ["tourism=museum"],

  // Hotels
  апартаменти: ["tourism=apartment"],
  мотель: ["tourism=motel"],
  motel: ["tourism=motel"],

  // ── Russian synonyms (widely searched across UA/CIS region) ──
  // Health
  врач: ["amenity=doctors"],
  больница: ["amenity=hospital"],
  поликлиника: ["amenity=clinic"],
  стоматология: ["amenity=dentist"],
  зубной: ["amenity=dentist"],
  ветеринар: ["amenity=veterinary"],
  ветклиника: ["amenity=veterinary"],
  массаж: ["shop=massage"],
  // Beauty
  парикмахерская: ["shop=hairdresser"],
  красота: ["shop=beauty"],
  "салон красоты": ["shop=beauty"],
  маникюр: ["shop=beauty"],
  ногти: ["shop=beauty"],
  // Food
  столовая: ["amenity=restaurant"],
  пиццерия: ["amenity=restaurant", "cuisine=pizza"],
  суши: ["amenity=restaurant", "cuisine=sushi"],
  кофейня: ["amenity=cafe", "cuisine=coffee_shop"],
  пивная: ["amenity=pub", "amenity=bar"],
  кондитерская: ["shop=confectionery", "shop=pastry"],
  // Auto
  автомойка: ["amenity=car_wash"],
  автосервис: ["craft=car_repair", "shop=car_repair"],
  запчасти: ["shop=car_parts"],
  автозаправка: ["amenity=fuel"],
  азс: ["amenity=fuel"],
  // Home & services
  химчистка: ["shop=dry_cleaning", "shop=laundry"],
  прачечная: ["shop=laundry"],
  типография: ["shop=copyshop", "craft=printer"],
  фотостудия: ["craft=photographer", "shop=photo"],
  // Shopping
  одежда: ["shop=clothes"],
  обувь: ["shop=shoes"],
  мебель: ["shop=furniture"],
  цветы: ["shop=florist"],
  цветочный: ["shop=florist"],
  ювелирный: ["shop=jewelry"],
  очки: ["shop=optician"],
  // Pro services
  недвижимость: ["office=estate_agent"],
  риелтор: ["office=estate_agent"],
  риэлтор: ["office=estate_agent"],
  страхование: ["office=insurance"],
  бухгалтерия: ["office=accountant"],
  нотариус: ["office=notary"],
  // Hotels & education
  гостиница: ["tourism=hotel"],
  "детский сад": ["amenity=kindergarten"],
  садик: ["amenity=kindergarten"],
  // Leisure
  бассейн: ["leisure=swimming_pool"],
  тренажерный: ["leisure=fitness_centre"],

  // ── More popular spheres (UA/regional B2B web-dev leads) ──
  ломбард: ["shop=pawnbroker"],
  pawnshop: ["shop=pawnbroker"],
  "обмін валют": ["amenity=bureau_de_change"],
  "обмен валют": ["amenity=bureau_de_change"],
  табак: ["shop=tobacco"],
  tobacco: ["shop=tobacco"],
  вейп: ["shop=e-cigarette"],
  vape: ["shop=e-cigarette"],
  "ритуальні послуги": ["shop=funeral_directors"],
  ритуальные: ["shop=funeral_directors"],
  тканини: ["shop=fabric"],
  ткани: ["shop=fabric"],
  fabric: ["shop=fabric"],
  посуд: ["shop=houseware"],
  посуда: ["shop=houseware"],
  вікна: ["craft=window_construction"],
  окна: ["craft=window_construction"],
  двері: ["shop=doors"],
  двери: ["shop=doors"],
  маркетинг: ["office=advertising_agency"],
  "веб-студія": ["office=it"],
  web: ["office=it"],
  кейтеринг: ["craft=caterer"],
  catering: ["craft=caterer"],
  кіоск: ["shop=kiosk"],
  киоск: ["shop=kiosk"],
  сувеніри: ["shop=gift"],
  сувениры: ["shop=gift"],

  // ── English synonyms ──
  vet: ["amenity=veterinary"],
  grocery: ["shop=convenience", "shop=supermarket"],
  store: ["shop"],
  realtor: ["office=estate_agent"],
  accounting: ["office=accountant"],
  dental: ["amenity=dentist"],
  florist: ["shop=florist"],
};

// Broad tags for unknown keywords — combined with name search to avoid timeout
const BROAD_BUSINESS_TAGS = [
  "amenity=restaurant",
  "amenity=cafe",
  "amenity=fast_food",
  "amenity=bar",
  "shop",
  "office",
  "craft",
];

// ─── Keyword resolution: normalize → stem → fuzzy ───────────
// Ukrainian queries arrive in many forms (plural, cases, apostrophe variants).
// Exact-map lookup misses them, so we reduce every keyword and every map key
// to a common stem and match on that, with a typo-tolerant fallback.

// Lowercase, unify the 6 apostrophe glyphs, drop stray punctuation, collapse spaces.
function normalizeKeyword(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʼʹ'`´’‘]/g, "'")
    .replace(/[^a-zа-яіїєґ0-9'\s-]/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Ukrainian inflectional endings, longest-first so multi-char endings win.
const UK_ENDINGS = [
  "ами", "ями", "ах", "ях", "ів", "їв", "ою", "ею", "ом", "ем",
  "і", "и", "а", "я", "у", "ю", "е", "є", "ї", "ь", "о",
].sort((a, b) => b.length - a.length);

// Strip one inflectional ending, keeping a stem of at least 3 chars.
function ukStem(word: string): string {
  for (const end of UK_ENDINGS) {
    if (word.length - end.length >= 3 && word.endsWith(end)) {
      return word.slice(0, word.length - end.length);
    }
  }
  return word;
}

// Bounded Levenshtein for short single-token typo tolerance.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

// Lazily-built indexes over KEYWORD_MAP keyed by normalized form and by stem.
let normIndex: Map<string, string[]> | null = null;
let stemIndex: Map<string, string[]> | null = null;
let stemKeys: string[] = [];

function buildKeywordIndexes(): void {
  if (normIndex) return;
  normIndex = new Map();
  stemIndex = new Map();
  for (const [k, tags] of Object.entries(KEYWORD_MAP)) {
    const nk = normalizeKeyword(k);
    if (!normIndex.has(nk)) normIndex.set(nk, tags);
    const sk = ukStem(nk);
    if (!stemIndex.has(sk)) stemIndex.set(sk, tags);
  }
  stemKeys = [...stemIndex.keys()];
}

// Resolve a free-form keyword to OSM tags. Tries, in order: exact normalized
// match, per-token stem match, stem prefix/substring, then a tight typo fuzzy.
// Returns null only when nothing plausibly maps (caller falls back to name search).
function resolveKeyword(keyword: string): string[] | null {
  buildKeywordIndexes();
  const norm = normalizeKeyword(keyword);
  if (!norm) return null;

  if (normIndex!.has(norm)) return normIndex!.get(norm)!;

  const tokens = norm.split(" ").filter((t) => t.length >= 3);
  const collected: string[] = [];

  for (const tok of [norm, ...tokens]) {
    if (normIndex!.has(tok)) { collected.push(...normIndex!.get(tok)!); continue; }

    const st = ukStem(tok);
    if (stemIndex!.has(st)) { collected.push(...stemIndex!.get(st)!); continue; }

    if (st.length >= 4) {
      const pref = stemKeys.find((k) => k.length >= 4 && (k.startsWith(st) || st.startsWith(k)));
      if (pref) { collected.push(...stemIndex!.get(pref)!); continue; }
    }

    if (st.length >= 5) {
      let best: string | null = null;
      let bestD = 2;
      for (const k of stemKeys) {
        if (Math.abs(k.length - st.length) > 1) continue;
        const d = levenshtein(st, k);
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best) collected.push(...stemIndex!.get(best)!);
    }
  }

  // Cap tag count so multi-word inputs ("піца суші бар кафе") can't balloon the
  // Overpass query into a timeout.
  return collected.length > 0 ? [...new Set(collected)].slice(0, 12) : null;
}

// ─── Geocoding cache (in-memory) ────────────────────────────
const geoCache = new Map<string, GeoCoords>();
const GEO_CACHE_TTL = 3600_000; // 1 hour

// ─── Overpass query result cache (in-memory, LRU-like) ──────
interface OverpassCacheEntry {
  elements: any[];
  timestamp: number;
}
const overpassCache = new Map<string, OverpassCacheEntry>();
const OVERPASS_CACHE_TTL = 3_600_000; // 60 minutes — business locations change slowly
const OVERPASS_CACHE_MAX = 250; // max entries

function getCachedOverpass(query: string): any[] | null {
  const entry = overpassCache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > OVERPASS_CACHE_TTL) {
    overpassCache.delete(query); // expired
    return null;
  }
  // LRU: move to end by delete + re-insert
  overpassCache.delete(query);
  overpassCache.set(query, entry);
  return entry.elements;
}

function setCachedOverpass(query: string, elements: any[]): void {
  // LRU eviction: remove oldest entry (first key in insertion order)
  if (overpassCache.size >= OVERPASS_CACHE_MAX) {
    const oldestKey = overpassCache.keys().next().value;
    if (oldestKey !== undefined) {
      overpassCache.delete(oldestKey);
    }
  }
  overpassCache.set(query, { elements, timestamp: Date.now() });
}

// ─── Overpass edge cache (Cloudflare Cache API) ─────────────
// The in-memory Map above only lives for one Worker isolate and rarely survives
// between requests on Cloudflare. `caches.default` persists per data-center, so
// the same city+keyword search reuses a prior result instead of re-hitting
// Overpass. On Node/Vercel `caches.default` doesn't exist → these become no-ops
// and the in-memory cache is the only layer (which is fine there).
const EDGE_CACHE_TTL_S = 3600; // 1 hour

function getEdgeCache(): any | null {
  try {
    const c: any = (globalThis as any).caches;
    return c && c.default ? c.default : null;
  } catch {
    return null;
  }
}

function edgeCacheKey(query: string): string {
  // djb2 hash → short, stable key (the raw Overpass QL is too long for a URL)
  let h = 5381;
  for (let i = 0; i < query.length; i++) h = (((h << 5) + h) + query.charCodeAt(i)) | 0;
  return `https://overpass-cache.local/q/${(h >>> 0).toString(36)}`;
}

async function getCachedEdge(query: string): Promise<any[] | null> {
  const cache = getEdgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(new Request(edgeCacheKey(query)));
    if (!hit) return null;
    const data = await hit.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function setCachedEdge(query: string, elements: any[]): Promise<void> {
  const cache = getEdgeCache();
  if (!cache) return;
  try {
    const resp = new Response(JSON.stringify(elements), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${EDGE_CACHE_TTL_S}`,
      },
    });
    await cache.put(new Request(edgeCacheKey(query)), resp);
  } catch {
    // best-effort; never let caching break the request
  }
}

// ─── Geocoding (Photon + Nominatim fallback) ────────────────

// Well-known Dubai districts/communities that collide with a more globally
// "important" same-name place (Al Quoz → Saudi Arabia, Marina → Croatia).
// Bare Latin geocoding ranks by global importance and picks the wrong one,
// so we pin these to Dubai by appending the country context before geocoding.
// Key = normalized user input; value = canonical district name for the query.
const DUBAI_DISTRICTS: Record<string, string> = {
  "al quoz": "Al Quoz",
  "business bay": "Business Bay",
  "downtown dubai": "Downtown Dubai",
  "jlt": "Jumeirah Lakes Towers",
  "jumeirah lakes towers": "Jumeirah Lakes Towers",
  "marina": "Dubai Marina",
  "dubai marina": "Dubai Marina",
  "deira": "Deira",
  "bur dubai": "Bur Dubai",
  "al barsha": "Al Barsha",
  "jumeirah": "Jumeirah",
  "palm jumeirah": "Palm Jumeirah",
  "jvc": "Jumeirah Village Circle",
  "jumeirah village circle": "Jumeirah Village Circle",
  "dubai silicon oasis": "Dubai Silicon Oasis",
  "international city": "International City",
  "karama": "Al Karama",
  "al karama": "Al Karama",
  "satwa": "Al Satwa",
  "discovery gardens": "Discovery Gardens",
  "mirdif": "Mirdif",
  "the greens": "The Greens",
  "motor city": "Motor City",
  "sports city": "Dubai Sports City",
};

// Returns a country-qualified geocode query for a known Dubai district, or
// null when the input is not a bare district (already qualified, or unknown).
function dubaiDistrictQuery(city: string): string | null {
  if (/dubai|emirat|uae|united arab/i.test(city)) return null;
  const canonical = DUBAI_DISTRICTS[city.toLowerCase().trim()];
  return canonical ? `${canonical}, Dubai, United Arab Emirates` : null;
}

export async function geocodeCity(city: string): Promise<GeoCoords> {
  const cacheKey = city.toLowerCase().trim();
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - (cached as any)._ts < GEO_CACHE_TTL) {
    return cached;
  }

  // Pin bare Dubai districts to the UAE so omonyms abroad don't win.
  const geoQuery = dubaiDistrictQuery(city) ?? city;

  const isCyrillicQuery = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(city);

  let coords: GeoCoords | null;
  if (isCyrillicQuery) {
    // Cyrillic: prefer Ukraine. Photon first; its settlement scoring (UA bonus +
    // major-oblast bonus) resolves major Ukrainian cities to the real centre.
    coords = await geocodePhoton(geoQuery);
    const photonIsUA =
      !!coords &&
      (coords.displayName.includes("Україн") ||
        coords.displayName.includes("Ukraine"));
    // Only cross-check with Nominatim when Photon did NOT already find a Ukrainian
    // place (e.g. it resolved to a same-name BY/RU town). If Photon already has a
    // UA hit, trust it — Nominatim ranks the real city as a low-priority
    // `administrative` boundary and lets same-name villages outrank it, which
    // would drag the search centre out to a random hamlet (e.g. Львів → a village
    // near Кривий Ріг instead of the city of Lviv).
    if (!photonIsUA) {
      const nominatimResult = await geocodeNominatim(geoQuery);
      if (
        nominatimResult &&
        (nominatimResult.displayName.includes("Україн") ||
          nominatimResult.displayName.includes("Ukraine"))
      ) {
        coords = nominatimResult;
      }
      if (!coords) coords = nominatimResult;
    }
  } else {
    // Latin: Photon scores by settlement type only and ignores global
    // importance, so omonyms resolve wrong (Warsaw → Warsaw, Indiana instead
    // of Warszawa, Poland). Nominatim ranks by importance globally, so prefer
    // its settlement; fall back to Photon if Nominatim is unavailable.
    const [photon, nominatim] = await Promise.all([
      geocodePhoton(geoQuery),
      geocodeNominatim(geoQuery, false),
    ]);
    coords = nominatim || photon;
  }

  // Second attempt: append "місто" (Ukrainian for "city") to prioritize city results
  if (!coords) {
    coords = await geocodePhoton(`${geoQuery} місто`);
    if (!coords) {
      coords = await geocodeNominatim(`${geoQuery} місто`);
    }
  }

  // Final pass: global Nominatim with no country restriction so a Cyrillic-named
  // city outside Ukraine (Алматы, София, Белград…) still resolves.
  if (!coords) {
    coords = await geocodeNominatim(geoQuery, false);
  }

  if (!coords) {
    throw new Error(
      `Місто "${city}" не знайдено. Спробуйте: Kyiv, Дніпро, Львів, London, Warszawa...`
    );
  }

  console.log(`[Geo] "${city}" → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (${coords.displayName})`);

  // Cache result
  (coords as any)._ts = Date.now();
  geoCache.set(cacheKey, coords);

  return coords;
}

async function geocodePhoton(city: string): Promise<GeoCoords | null> {
  try {
    // Request multiple results so we can filter for city/settlement types
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=10`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "LeadFinder/1.0" },
      signal: AbortSignal.timeout(8000), // 8s timeout
    });

    if (!resp.ok) return null;

    // Check content-type before parsing JSON
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      console.warn(`[Photon] Non-JSON response (content-type: ${contentType}, status: ${resp.status}) for city: ${city}`);
      return null;
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (parseErr) {
      console.warn(`[Photon] JSON parse error for city: ${city}`, parseErr);
      return null;
    }

    const features = data?.features;
    if (!features || features.length === 0) return null;

    // Types that should NEVER be selected as a city (rivers, stations, etc.)
    const excludedTypes = new Set([
      "river", "water", "stream", "waterway", "canal", "lake",
      "station", "bus_stop", "tram_stop", "railway",
      "industrial", "garages", "quarry", "water_tower",
      "hotel", "motel", "hostel", "guest_house",
    ]);

    // Priority order for settlement types (higher = better)
    const typePriority: Record<string, number> = {
      city: 10,
      town: 8,
      municipality: 7,
      borough: 6,
      village: 5,
      suburb: 4,
      hamlet: 3,
      neighbourhood: 2,
      quarter: 2,
      district: 1,
    };

    // Detect if query is in Cyrillic → prefer Ukrainian results
    const isCyrillic = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(city);

    // Score and sort results
    const scored = features.map((f: any) => {
      const props = f.properties || {};
      const osmType = props.osm_value || props.type || "";
      const country = (props.countrycode || "").toUpperCase();
      const state = props.state || "";

      // Skip excluded types entirely
      if (excludedTypes.has(osmType)) return { feature: f, score: -999 };

      let score = typePriority[osmType] || 0;

      // Bonus for Cyrillic query → prefer UA results
      if (isCyrillic && country === "UA") score += 20;
      // Small bonus for BY/RU if Cyrillic (but much less than UA)
      if (isCyrillic && (country === "BY" || country === "RU")) score += 5;

      // Check for oblast/state names that indicate major Ukrainian cities
      const majorCityStates = [
        "Дніпропетровська", "Київська", "Львівська", "Одеська",
        "Харківська", "Донецька", "Запорізька", "Вінницька",
      ];
      if (majorCityStates.some((s) => state.includes(s))) score += 15;

      return { feature: f, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Find best valid result
    const best = scored.find((s) => s.score > 0);
    if (!best) return null;

    const f = best.feature;
    const props = f.properties || {};
    const coords = f.geometry?.coordinates;

    if (!coords) return null;

    // Build display name with country context
    const state = props.state ? `, ${props.state}` : "";
    const country = props.country ? ` (${props.country})` : "";
    const displayName = `${props.name || city}${state}${country}`;

    return {
      lat: coords[1],
      lng: coords[0],
      displayName,
    };
  } catch {
    return null;
  }
}

// Normalize a place name to its bare core (first comma-segment, lowercased,
// diacritics stripped) so "Amsterdam, North Holland, NL" → "amsterdam".
function geoCore(s: string): string {
  return (s.split(",")[0] || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9Ѐ-ӿ ]+/g, "")
    .trim();
}

async function geocodeNominatim(city: string, restrictToUA: boolean = true): Promise<GeoCoords | null> {
  try {
    // Detect Cyrillic for language/country preference
    const isCyrillic = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(city);
    const lang = isCyrillic ? "uk,en" : "en";

    // Request more results for better filtering
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=10&accept-language=${lang}`;

    // For Cyrillic queries, prefer Ukraine — but only when restrictToUA is set.
    // The final geocode pass clears this so cities in any country still resolve.
    if (isCyrillic && restrictToUA) {
      url += `&countrycodes=ua`;
    }

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "LeadFinder/1.0 (educational tool; +https://github.com)",
      },
      signal: AbortSignal.timeout(8000), // 8s timeout
    });

    // Nominatim returns 403 when rate-limited
    if (!resp.ok) return null;

    // Check content-type before parsing JSON
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      console.warn(`[Nominatim] Non-JSON response (content-type: ${contentType}, status: ${resp.status}) for city: ${city}`);
      return null;
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (parseErr) {
      console.warn(`[Nominatim] JSON parse error for city: ${city}`, parseErr);
      return null;
    }

    if (!data || data.length === 0) return null;

    // Excluded types: rivers, waterways, stations, etc.
    const excludedClasses = new Set(["waterway", "railway", "highway", "natural"]);
    const excludedTypes = new Set(["river", "stream", "lake", "canal", "station", "bus_stop"]);

    // Filter out non-settlement results
    const settlementTypes = new Set(["city", "town", "village", "hamlet", "municipality", "borough"]);

    // Priority: city with class=place > administrative boundary > town/village
    const typePriority: Record<string, number> = {
      city: 10,
      town: 7,
      village: 5,
      municipality: 6,
      borough: 4,
      hamlet: 3,
      administrative: 2,
    };

    // Region-level admin areas (state/emirate/province/country): their point is
    // the region centroid, often in sparse/desert land far from the actual city
    // (e.g. "Sharjah" the emirate vs. Sharjah the city). Demote them.
    const regionTypes = new Set([
      "state", "region", "province", "county", "country", "continent", "archipelago",
    ]);
    // Sub-city subdivisions: a same-named suburb/neighbourhood must not outrank
    // the actual city (e.g. a "São Paulo" suburb in Pará vs. the megacity, which
    // OSM tags as an administrative boundary with no place-bonus).
    const subCityTypes = new Set([
      "suburb", "neighbourhood", "quarter", "locality", "city_block", "allotments",
    ]);
    const qCore = geoCore(city);

    const scored = data.map((r: any) => {
      const type = (r.type || "").toLowerCase();
      const cls = String(r.class || "");

      // Exclude waterways, railways, highways
      if (excludedClasses.has(cls) || excludedTypes.has(type)) {
        return { result: r, score: -999 };
      }

      let score = typePriority[type] || 0;

      // Bonus for class=place
      if (cls === "place") score += 5;

      // Bonus for importance
      score += (r.importance || 0) * 10;

      // Demote region centroids so the city/settlement wins.
      if (regionTypes.has(type)) score -= 8;

      // Demote sub-city subdivisions so a same-named city wins over a suburb.
      if (subCityTypes.has(type)) score -= 7;

      // Strong reward for an exact name match so a high-importance *different*
      // place can't outrank the real city (e.g. "Amsterdam" → New York).
      const rCore = geoCore(r.display_name || r.name || "");
      if (qCore && rCore === qCore) score += 12;

      return { result: r, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored.find((s) => s.score > 0);
    if (!best) return null;

    const result = best.result;
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      displayName: result.display_name || city,
    };
  } catch {
    return null;
  }
}

// ─── Main search function ───────────────────────────────────

export async function searchOverpass(
  city: string,
  keyword: string,
  maxResults: number = 20,
  radiusKm: number = 10
): Promise<OSMResult[]> {
  // Step 1: Geocode city, then delegate to the coordinate-based search.
  const coords = await geocodeCity(city);
  return searchOverpassAt(coords.lat, coords.lng, keyword, maxResults, radiusKm);
}

// Coordinate-based search — used when the caller already has exact coordinates
// (e.g. from the city autocomplete), so no geocoding guess is involved.
export async function searchOverpassAt(
  lat: number,
  lng: number,
  keyword: string,
  maxResults: number = 20,
  radiusKm: number = 10
): Promise<OSMResult[]> {
  const coords = { lat, lng };

  // Over-fetch a larger candidate pool than the caller asked for, so ranking
  // (no-site leads first) can promote the best prospects before we slice down.
  // Without this, Overpass' arbitrary order could push every HOT no-site lead
  // past the maxResults cutoff and the client would never see them.
  const pool = Math.min(Math.max(maxResults * 3, 60), 200);

  // Step 2: Determine search strategy
  // resolveKeyword handles plural/case forms, apostrophe variants and typos,
  // so "ресторани", "аптек", "кавʼярні" all map to the right OSM tags.
  const matchedTags = resolveKeyword(keyword);
  if (matchedTags) {
    console.log(`[Search] "${keyword}" → tags: ${matchedTags.join(", ")}`);
  } else {
    console.log(`[Search] "${keyword}" → no tag match, broad name search`);
  }

  // Step 3: Build & execute query with fallback
  let allElements: any[] = [];

  if (matchedTags) {
    // ── Known category: precise tag search (fast & reliable) ──
    // Search nodes and ways separately because output format differs
    const nodeElements = await executeQuery(
      buildTagQuery(matchedTags, coords.lat, coords.lng, radiusKm, pool, "node"),
    );
    allElements.push(...nodeElements);

    if (allElements.length < pool) {
      const wayElements = await executeQuery(
        buildTagQuery(matchedTags, coords.lat, coords.lng, radiusKm, pool, "way"),
      );
      allElements.push(...wayElements);
    }
  } else {
    // ── Unknown keyword: broad search with name filter ──
    const elements = await executeQuery(
      buildBroadQuery(keyword, coords.lat, coords.lng, radiusKm, pool),
    );
    allElements.push(...elements);
  }

  // Step 4: Parse, deduplicate, rank, then trim to the requested count.
  if (allElements.length === 0) {
    return [];
  }

  const parsed = parseOverpassResults(allElements, pool);
  return pageLeads(rankLeads(parsed), maxResults);
}

// Build the final page from ranked leads. No-site HOT leads stay on top, but a
// slice of the page is reserved for businesses that DO have a site so the user
// always sees them too (otherwise a big no-site pool would bury every site past
// the cutoff and the results would look broken).
function pageLeads(ranked: OSMResult[], maxResults: number): OSMResult[] {
  const hasSite = (l: OSMResult) => !!l.website && l.website !== "N/A";
  const noSite = ranked.filter((l) => !hasSite(l)); // tiers 0–2, order preserved
  const sites = ranked.filter(hasSite); // tier 3, order preserved
  if (sites.length === 0 || noSite.length === 0) return ranked.slice(0, maxResults);

  const siteQuota = Math.min(sites.length, Math.max(3, Math.floor(maxResults * 0.25)));
  const noSiteSlots = Math.max(0, maxResults - siteQuota);
  const page = [...noSite.slice(0, noSiteSlots), ...sites.slice(0, siteQuota)];

  // Backfill from the remaining ranked pool if either bucket was short.
  if (page.length < maxResults) {
    const used = new Set(page);
    for (const l of ranked) {
      if (page.length >= maxResults) break;
      if (!used.has(l)) page.push(l);
    }
  }
  return page.slice(0, maxResults);
}

// Order leads by outreach value: businesses with no real website are the
// product (HOT prospects for building one), and among those the reachable ones
// (have a phone / email / social channel) come first. Sites are kept last —
// the client analyzes them separately to grade redesign potential.
function rankLeads(leads: OSMResult[]): OSMResult[] {
  const hasSite = (l: OSMResult) => !!l.website && l.website !== "N/A";
  const reachable = (l: OSMResult) =>
    (!!l.phone && l.phone !== "N/A") ||
    !!l.email ||
    !!l.facebook ||
    !!l.instagram ||
    !!l.telegram;
  // 0 = social-only (online, no site — warmest), 1 = no-site & reachable,
  // 2 = no-site no contact, 3 = has a real site (needs redesign analysis).
  const tier = (l: OSMResult) =>
    l.socialOnly ? 0 : hasSite(l) ? 3 : reachable(l) ? 1 : 2;
  // Stable sort (Array.prototype.sort is stable in modern JS) preserves the
  // original Overpass order within each tier.
  return [...leads].sort((a, b) => tier(a) - tier(b));
}

// ─── Query builders ─────────────────────────────────────────

function buildTagQuery(
  tags: string[],
  lat: number,
  lng: number,
  radiusKm: number,
  maxResults: number,
  elementType: "node" | "way"
): string {
  const radius = Math.min(radiusKm * 1000, 50000); // Cap at 50km
  const conditions: string[] = [];

  for (const tag of tags) {
    const [key, value] = tag.split("=");
    if (value) {
      conditions.push(`${elementType}["${key}"="${value}"](around:${radius},${lat},${lng});`);
    } else {
      conditions.push(`${elementType}["${key}"](around:${radius},${lat},${lng});`);
    }
  }

  // Use "out body" for nodes (has lat/lon directly) or "out center" for ways
  // qt = sort by quadtile (faster), limit to maxResults*2 to allow deduplication headroom
  const output = elementType === "node" ? "out body" : "out center";
  const limit = Math.min(maxResults * 2, 400);

  return (
    `[out:json][timeout:25];\n` +
    `(\n  ${conditions.join("\n  ")}\n);\n` +
    `${output} qt ${limit};`
  );
}

function buildBroadQuery(
  keyword: string,
  lat: number,
  lng: number,
  radiusKm: number,
  maxResults: number
): string {
  const radius = Math.min(radiusKm * 1000, 25000); // Smaller radius for broad search (cap 25km)
  // Search on the stem so the name regex still matches declined/plural forms
  // (e.g. stem "пекарн" matches "Пекарня", "Пекарні"). Fall back to the full
  // normalized keyword when the stem is too short to be meaningful.
  const norm = normalizeKeyword(keyword);
  const stem = ukStem(norm);
  const pattern = stem.length >= 4 ? stem : norm || keyword;
  // Escape regex special chars AND double quotes (QL uses " as string delimiter)
  const escaped = pattern.replace(/[-.*+?^${}()|[\]\\"]/g, "\\$&");

  const conditions: string[] = [];

  // Search by name across broad business categories
  for (const tag of BROAD_BUSINESS_TAGS) {
    const [key, value] = tag.split("=");
    if (value) {
      conditions.push(`node["${key}"="${value}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
      conditions.push(`way["${key}"="${value}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
    } else {
      conditions.push(`node["${key}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
      conditions.push(`way["${key}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
    }
  }

  // Use "out center" for ways to get center coordinates, "out body" for nodes
  return (
    `[out:json][timeout:25];\n` +
    `(\n  ${conditions.join("\n  ")}\n);\n` +
    `out center qt ${maxResults};`
  );
}

// ─── Retry helpers ──────────────────────────────────────────

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Query execution: parallel mirror racing ─────────────────

const OVERALL_TIMEOUT_MS = 50000; // Hard deadline: 50s (Vercel limit is 60s)
const PER_REQUEST_TIMEOUT_MS = 23000; // Each parallel fetch: 23s — two race rounds fit inside the 50s budget
const MAX_RACE_ROUNDS = 2; // How many times to re-race all mirrors before giving up
const RACE_ROUND_BACKOFF_MS = 1200; // Short pause between race rounds

/** Thrown by fetchFromEndpoint so Promise.any treats a bad response as a rejection. */
class EndpointError extends Error {
  constructor(public endpoint: string, message: string) {
    super(message);
  }
}

/**
 * Query a single Overpass mirror. Resolves with the elements array (possibly
 * empty — an empty result is still a valid answer) or throws an EndpointError.
 * Since every mirror serves the same OSM data, the first valid response wins.
 */
async function fetchFromEndpoint(
  endpoint: string,
  query: string,
  roundSignal: AbortSignal,
): Promise<any[]> {
  const reqController = new AbortController();
  const reqTimeout = setTimeout(() => reqController.abort(), PER_REQUEST_TIMEOUT_MS);
  // Abort this fetch if the round is aborted (another mirror already won).
  const onRoundAbort = () => reqController.abort();
  roundSignal.addEventListener("abort", onRoundAbort, { once: true });

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "LeadFinder/1.0 (lead-generator-tool)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: reqController.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new EndpointError(endpoint, extractOverpassError(text, resp.status));
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      const text = await resp.text().catch(() => "");
      throw new EndpointError(endpoint, extractOverpassError(text, resp.status));
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (parseErr) {
      throw new EndpointError(
        endpoint,
        `JSON parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      );
    }

    if (data.remark && String(data.remark).includes("error")) {
      throw new EndpointError(endpoint, data.remark);
    }

    return Array.isArray(data.elements) ? data.elements : [];
  } finally {
    clearTimeout(reqTimeout);
    roundSignal.removeEventListener("abort", onRoundAbort);
  }
}

async function executeQuery(query: string): Promise<any[]> {
  // 1) In-memory cache — fastest, but only within a warm isolate.
  const cached = getCachedOverpass(query);
  if (cached !== null) {
    console.log(`[Overpass] Memory cache hit`);
    return cached;
  }

  // 2) Edge cache (Cloudflare) — survives across requests/isolates.
  const edge = await getCachedEdge(query);
  if (edge !== null) {
    console.log(`[Overpass] Edge cache hit`);
    setCachedOverpass(query, edge); // warm the in-memory layer too
    return edge;
  }

  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  let lastError = "";

  for (let round = 0; round < MAX_RACE_ROUNDS; round++) {
    if (Date.now() >= deadline) break;

    // Fire all mirrors at once; first valid response wins, losers get aborted.
    const roundController = new AbortController();
    try {
      const elements = await Promise.any(
        OVERPASS_ENDPOINTS.map((endpoint) =>
          fetchFromEndpoint(endpoint, query, roundController.signal),
        ),
      );
      roundController.abort(); // cancel the slower in-flight mirrors
      setCachedOverpass(query, elements); // cache success (including empty)
      await setCachedEdge(query, elements); // persist to edge cache too
      return elements;
    } catch (err) {
      // Promise.any rejects with an AggregateError only when every mirror failed.
      roundController.abort();
      if (err instanceof AggregateError && err.errors.length) {
        const last = err.errors[err.errors.length - 1];
        lastError = last instanceof Error ? last.message : String(last);
      } else {
        lastError = err instanceof Error ? err.message : String(err);
      }
      console.warn(
        `[Overpass] Race round ${round + 1}/${MAX_RACE_ROUNDS} — all mirrors failed: ${lastError}`,
      );

      // Backoff before the next round, but only if there's budget left.
      if (round < MAX_RACE_ROUNDS - 1 && Date.now() + RACE_ROUND_BACKOFF_MS < deadline) {
        await sleep(RACE_ROUND_BACKOFF_MS);
      }
    }
  }

  // Every round failed (or we ran out of time).
  throw new Error(
    `Усі сервери Overpass недоступні після ${MAX_RACE_ROUNDS} паралельних спроб. ` +
    `Остання помилка: ${lastError || "перевищено час очікування"}.\n\n` +
    `💡 Поради:\n` +
    `• Спробуйте повторити запит через хвилину\n` +
    `• Зменште радіус пошуку (наприклад, до 5 км)\n` +
    `• Overpass API — це безкоштовний сервіс, який може бути перевантажений`
  );
}

function extractOverpassError(html: string, status: number): string {
  // Extract error message from HTML response
  const match = html.match(/<strong[^>]*>Error<\/strong>:\s*(.+?)(?:<\/p>|<br)/i);
  if (match) return match[1].trim();

  if (html.includes("timeout")) {
    return "Сервер Overpass перевантажений. Спробуйте зменшити радіус або кількість результатів.";
  }
  if (html.includes("too busy")) {
    return "Сервер Overpass перевантажений. Спробуйте через хвилину.";
  }

  return `Overpass API помилка ${status}. Спробуйте пізніше або зменште радіус пошуку.`;
}

// ─── Parse results ──────────────────────────────────────────

function parseOverpassResults(elements: any[], maxResults: number): OSMResult[] {
  const results: OSMResult[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    if (results.length >= maxResults) break;

    const name = (el.tags?.name || "").trim();
    if (!name) continue;

    // Coordinates: nodes have lat/lon directly, ways have center
    const lat = el.lat ?? el.center?.lat ?? 0;
    const lng = el.lon ?? el.center?.lon ?? 0;
    if (lat === 0 && lng === 0) continue;

    // Deduplicate by name + approximate location (0.001° ≈ 100m)
    const locKey = `${Math.round(lat * 1000)}_${Math.round(lng * 1000)}`;
    const dedupKey = `${name.toLowerCase()}@${locKey}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const contacts = extractContacts(el.tags);

    results.push({
      name,
      phone: extractPhone(el.tags),
      website: contacts.website,
      address: buildAddress(el.tags),
      email: extractEmail(el.tags),
      facebook: contacts.facebook,
      instagram: contacts.instagram,
      telegram: contacts.telegram,
      socialOnly: contacts.socialOnly,
      openingHours: el.tags?.["opening_hours"] || "",
      description: el.tags?.["description"] || "",
      lat,
      lng,
      type: el.tags?.amenity || el.tags?.shop || el.tags?.craft || el.tags?.office || el.tags?.tourism || "business",
    });
  }

  return results;
}

function extractEmail(tags: Record<string, string> | undefined): string {
  if (!tags) return "";
  return tags["email"] || tags["contact:email"] || "";
}

function extractPhone(tags: Record<string, string> | undefined): string {
  if (!tags) return "N/A";
  const phone = tags["phone"] || tags["contact:phone"] || tags["contact:mobile"] || "";
  if (!phone) return "N/A";

  // Take first phone if multiple
  const first = phone.split(";")[0].split(",")[0].trim();
  return first;
}

function extractWebsite(tags: Record<string, string> | undefined): string {
  if (!tags) return "N/A";
  return tags["website"] || tags["contact:website"] || "N/A";
}

// Social platforms that businesses often put in the `website` tag instead of a
// real site. Detecting these lets us reclassify such leads as "social-only".
const SOCIAL_HOSTS: Array<{ re: RegExp; kind: "facebook" | "instagram" | "telegram" | "other" }> = [
  { re: /(?:^|\.)facebook\.com|(?:^|\.)fb\.(?:com|me)|(?:^|\.)m\.facebook\.com/i, kind: "facebook" },
  { re: /(?:^|\.)instagram\.com|(?:^|\.)instagr\.am/i, kind: "instagram" },
  { re: /(?:^|\.)t\.me|(?:^|\.)telegram\.(?:me|org)/i, kind: "telegram" },
  { re: /(?:^|\.)(?:tiktok\.com|twitter\.com|x\.com|vk\.com|wa\.me|api\.whatsapp\.com|linktr\.ee|taplink\.[a-z]+|youtube\.com|youtu\.be|linkedin\.com)/i, kind: "other" },
];

function classifySocialUrl(url: string): "facebook" | "instagram" | "telegram" | "other" | null {
  if (!url || url === "N/A") return null;
  let host = url;
  try {
    host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    /* not a parseable URL — fall back to matching the raw string */
  }
  for (const { re, kind } of SOCIAL_HOSTS) {
    if (re.test(host)) return kind;
  }
  return null;
}

interface Contacts {
  website: string;
  facebook: string;
  instagram: string;
  telegram: string;
  socialOnly: boolean;
}

// Resolve a business's contact channels, correcting the common case where the
// `website` tag actually points to a social profile. Such a lead has no real
// website → we move the link to the right social field and flag it socialOnly,
// so ranking/scoring treats it as a HOT prospect instead of "has a site".
function extractContacts(tags: Record<string, string> | undefined): Contacts {
  let website = extractWebsite(tags);
  let facebook = tags?.["contact:facebook"] || "";
  let instagram = tags?.["contact:instagram"] || "";
  let telegram = tags?.["contact:telegram"] || "";

  const kind = classifySocialUrl(website);
  if (kind) {
    if (kind === "facebook") facebook = facebook || website;
    else if (kind === "instagram") instagram = instagram || website;
    else if (kind === "telegram") telegram = telegram || website;
    website = "N/A"; // it was a social link, not a real website
  }

  const socialOnly = website === "N/A" && !!(facebook || instagram || telegram);
  return { website, facebook, instagram, telegram, socialOnly };
}

function buildAddress(tags: Record<string, string> | undefined): string {
  if (!tags) return "N/A";
  const parts: string[] = [];

  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  if (street) {
    parts.push(number ? `${street} ${number}` : street);
  }

  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"];
  if (city) parts.push(city);

  const postcode = tags["addr:postcode"];
  if (postcode) parts.push(postcode);

  return parts.length > 0 ? parts.join(", ") : "N/A";
}
