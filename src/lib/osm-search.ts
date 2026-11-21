// OpenStreetMap data via Overpass, with Photon city lookup and Nominatim
// as a fallback for explicit city searches.

export interface GeoCoords {
  lat: number;
  lng: number;
  displayName: string;
}

export function validCoordinates(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export interface OSMResult {
  osmId: string;
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
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// ─── Keyword → OSM tag mapping ───────────────────────────────

const PIZZERIAS = ["amenity=restaurant&cuisine=pizza", "amenity=fast_food&cuisine=pizza"];
const SUSHI_RESTAURANTS = ["amenity=restaurant&cuisine=sushi", "amenity=fast_food&cuisine=sushi"];
const BURGER_RESTAURANTS = ["amenity=restaurant&cuisine=burger", "amenity=fast_food&cuisine=burger"];
const DENTISTS = ["amenity=dentist", "healthcare=dentist"];

const KEYWORD_MAP: Record<string, string[]> = {
  // Food & Drink
  restaurant: ["amenity=restaurant"],
  ресторан: ["amenity=restaurant"],
  pizza: PIZZERIAS,
  піцерія: PIZZERIAS,
  піца: PIZZERIAS,
  cafe: ["amenity=cafe"],
  café: ["amenity=cafe"],
  кафе: ["amenity=cafe"],
  coffee: ["amenity=cafe", "cuisine=coffee_shop"],
  кавʼярня: ["amenity=cafe", "cuisine=coffee_shop"],
  bakery: ["shop=bakery"],
  пекарня: ["shop=bakery"],
  bar: ["amenity=bar"],
  бар: ["amenity=bar"],
  sushi: SUSHI_RESTAURANTS,
  суші: SUSHI_RESTAURANTS,
  фастфуд: ["amenity=fast_food"],
  fast_food: ["amenity=fast_food"],
  food: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe"],
  їжа: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe"],
  пиво: ["amenity=bar", "microbrewery=yes"],
  beer: ["amenity=bar", "microbrewery=yes"],

  // Health
  dentist: DENTISTS,
  стоматолог: DENTISTS,
  стоматологія: DENTISTS,
  "стоматологічна клініка": DENTISTS,
  "стоматологічні клініки": DENTISTS,
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
  бургерна: BURGER_RESTAURANTS,
  burger: BURGER_RESTAURANTS,
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
  стоматология: DENTISTS,
  зубной: DENTISTS,
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
  пиццерия: PIZZERIAS,
  суши: SUSHI_RESTAURANTS,
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
  dental: DENTISTS,
  florist: ["shop=florist"],

  // ── Polish synonyms (PL is a supported country; native niche words) ──
  // Food & Drink
  restauracja: ["amenity=restaurant"],
  pizzeria: PIZZERIAS,
  kawiarnia: ["amenity=cafe"],
  piekarnia: ["shop=bakery"],
  cukiernia: ["shop=confectionery", "shop=pastry"],
  winiarnia: ["shop=wine", "amenity=bar"],
  // Health & Beauty
  dentysta: DENTISTS,
  lekarz: ["amenity=doctors"],
  przychodnia: ["amenity=clinic"],
  apteka: ["amenity=pharmacy"],
  szpital: ["amenity=hospital"],
  weterynarz: ["amenity=veterinary"],
  fryzjer: ["shop=hairdresser"],
  barber: ["shop=hairdresser"],
  "salon piękności": ["shop=beauty"],
  kosmetyczka: ["shop=beauty"],
  kosmetyka: ["shop=beauty"],
  paznokcie: ["shop=beauty"],
  siłownia: ["leisure=fitness_centre"],
  fitness: ["leisure=fitness_centre"],
  // Auto
  warsztat: ["craft=car_repair", "shop=car_repair"],
  mechanik: ["craft=car_repair", "shop=car_repair"],
  myjnia: ["amenity=car_wash"],
  "stacja paliw": ["amenity=fuel"],
  "części samochodowe": ["shop=car_parts"],
  opony: ["shop=tyres"],
  // Home & Trades
  hydraulik: ["craft=plumber"],
  elektryk: ["craft=electrician"],
  stolarz: ["craft=carpenter"],
  malarz: ["craft=painter"],
  dekarz: ["craft=roofer"],
  ślusarz: ["craft=locksmith"],
  meble: ["shop=furniture"],
  budowlaniec: ["craft=builder"],
  krawiec: ["craft=tailor"],
  pralnia: ["shop=laundry"],
  "pralnia chemiczna": ["shop=dry_cleaning", "shop=laundry"],
  // Professional / Creative
  prawnik: ["office=lawyer"],
  "radca prawny": ["office=lawyer"],
  księgowy: ["office=accountant"],
  "biuro rachunkowe": ["office=accountant"],
  nieruchomości: ["office=estate_agent"],
  ubezpieczenia: ["office=insurance"],
  notariusz: ["office=notary"],
  architekt: ["office=architect"],
  fotograf: ["craft=photographer", "shop=photo"],
  drukarnia: ["shop=copyshop", "craft=printer"],
  marketing: ["office=advertising_agency"],
  // Shopping
  sklep: ["shop"],
  odzież: ["shop=clothes"],
  ubrania: ["shop=clothes"],
  obuwie: ["shop=shoes"],
  buty: ["shop=shoes"],
  elektronika: ["shop=electronics"],
  kwiaciarnia: ["shop=florist"],
  kwiaty: ["shop=florist"],
  księgarnia: ["shop=books"],
  jubiler: ["shop=jewelry"],
  optyk: ["shop=optician"],
  zabawki: ["shop=toys"],
  kosmetyki: ["shop=cosmetics", "shop=chemist"],
  perfumy: ["shop=perfumery"],
  sport: ["shop=sports"],
  rowery: ["shop=bicycle"],
  telefony: ["shop=mobile_phone"],
  komputery: ["shop=computer"],
  // Education
  szkoła: ["amenity=school"],
  uniwersytet: ["amenity=university"],
  przedszkole: ["amenity=kindergarten"],
  kursy: ["amenity=school", "school=language"],
  // Hotels & Tourism
  pensjonat: ["tourism=guest_house"],
  "biuro podróży": ["office=travel_agent"],
  // Leisure & Culture
  basen: ["leisure=swimming_pool"],
  kino: ["amenity=cinema"],
  teatr: ["amenity=theatre"],
  muzeum: ["tourism=museum"],
  kościół: ["amenity=place_of_worship"],

  // ── German synonyms (DE/AT/CH; ä ö ü ß fold to a/o/u/ss) ──
  // Food & Drink
  bäckerei: ["shop=bakery"],
  konditorei: ["shop=confectionery", "shop=pastry"],
  metzgerei: ["shop=butcher"],
  gaststätte: ["amenity=restaurant"],
  gasthaus: ["amenity=restaurant", "tourism=guest_house"],
  imbiss: ["amenity=fast_food"],
  kneipe: ["amenity=pub", "amenity=bar"],
  weinhandlung: ["shop=wine"],
  // Health & Beauty
  zahnarzt: DENTISTS,
  arzt: ["amenity=doctors"],
  hausarzt: ["amenity=doctors"],
  apotheke: ["amenity=pharmacy"],
  krankenhaus: ["amenity=hospital"],
  klinik: ["amenity=clinic"],
  tierarzt: ["amenity=veterinary"],
  friseur: ["shop=hairdresser"],
  kosmetik: ["shop=beauty"],
  kosmetikstudio: ["shop=beauty"],
  nagelstudio: ["shop=beauty"],
  fitnessstudio: ["leisure=fitness_centre"],
  // Auto
  autowerkstatt: ["craft=car_repair", "shop=car_repair"],
  kfz: ["craft=car_repair", "shop=car_repair"],
  autowäsche: ["amenity=car_wash"],
  tankstelle: ["amenity=fuel"],
  reifen: ["shop=tyres"],
  autoteile: ["shop=car_parts"],
  autohaus: ["shop=car"],
  // Home & Trades
  klempner: ["craft=plumber"],
  installateur: ["craft=plumber"],
  elektriker: ["craft=electrician"],
  tischler: ["craft=carpenter"],
  schreiner: ["craft=carpenter"],
  maler: ["craft=painter"],
  dachdecker: ["craft=roofer"],
  schlosser: ["craft=locksmith"],
  möbel: ["shop=furniture"],
  schneider: ["craft=tailor"],
  wäscherei: ["shop=laundry"],
  reinigung: ["shop=dry_cleaning", "shop=laundry"],
  // Professional / Creative
  rechtsanwalt: ["office=lawyer"],
  anwalt: ["office=lawyer"],
  notar: ["office=notary"],
  steuerberater: ["office=accountant"],
  buchhaltung: ["office=accountant"],
  immobilien: ["office=estate_agent"],
  makler: ["office=estate_agent"],
  versicherung: ["office=insurance"],
  werbung: ["office=advertising_agency"],
  druckerei: ["shop=copyshop", "craft=printer"],
  fotostudio: ["craft=photographer", "shop=photo"],
  // Shopping
  geschäft: ["shop"],
  laden: ["shop"],
  bekleidung: ["shop=clothes"],
  kleidung: ["shop=clothes"],
  schuhe: ["shop=shoes"],
  elektronik: ["shop=electronics"],
  blumen: ["shop=florist"],
  buchhandlung: ["shop=books"],
  juwelier: ["shop=jewelry"],
  schmuck: ["shop=jewelry"],
  optiker: ["shop=optician"],
  spielzeug: ["shop=toys"],
  // Education
  schule: ["amenity=school"],
  universität: ["amenity=university"],
  kita: ["amenity=kindergarten"],
  // Hotels & Tourism
  pension: ["tourism=guest_house"],
  reisebüro: ["office=travel_agent"],
  // Leisure & Culture
  schwimmbad: ["leisure=swimming_pool"],
  theater: ["amenity=theatre"],
  // Religious
  kirche: ["amenity=place_of_worship"],
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
    // Fold Latin (Polish/German/etc.) diacritics to their ASCII base so native
    // spellings resolve — the class-strip below would otherwise turn them into
    // spaces and split the word. Cyrillic is left intact (NFD would mangle й/ї).
    .replace(/ł/g, "l")
    .replace(/[ąàáâãä]/g, "a")
    .replace(/[ęèéêë]/g, "e")
    .replace(/[óòôõö]/g, "o")
    .replace(/[żź]/g, "z")
    .replace(/[ćç]/g, "c")
    .replace(/ś/g, "s")
    .replace(/ń/g, "n")
    .replace(/[üùúû]/g, "u")
    .replace(/[íìî]/g, "i")
    .replace(/ß/g, "ss")
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
  const tags = [...new Set(collected)];
  const specificTags = tags.filter((tag) =>
    tag.includes("=") || !tags.some((other) => other.startsWith(`${tag}=`)),
  );
  return specificTags.length > 0 ? specificTags.slice(0, 12) : null;
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

export async function geocodeCity(city: string, countryCode?: string): Promise<GeoCoords> {
  const cc = (countryCode || "").toLowerCase().trim();
  const region = regionalCity(city, cc);
  if (region) return { lat: region.lat, lng: region.lng, displayName: `${region.city}, Україна` };
  const cacheKey = `${cc}|${city.toLowerCase().trim()}`;
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - (cached as any)._ts < GEO_CACHE_TTL) {
    return cached;
  }

  // Qualify known Dubai districts only for a UAE or unscoped search.
  const districtQuery = (!cc || cc === "ae") ? dubaiDistrictQuery(city) : null;
  const geoQuery = districtQuery || city;
  const isCyrillic = /[а-яёіїєґ]/iu.test(city);
  const preferredCountry = cc || (districtQuery ? "ae" : isCyrillic ? "ua" : "");

  let coords = await geocodePhoton(geoQuery, preferredCountry);
  if (!coords) {
    // The public Nominatim endpoint is only used for an explicit search.
    coords = await geocodeNominatim(geoQuery, preferredCountry);
  }
  if (!coords && !cc && preferredCountry === "ua") {
    coords = await geocodePhoton(geoQuery);
  }

  if (!coords) {
    throw new Error(
      `Не вдалося визначити місто «${city}». Уточніть назву й країну або повторіть пошук.`
    );
  }

  console.log(`[Geo] "${city}" → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (${coords.displayName})`);

  // Cache result
  (coords as any)._ts = Date.now();
  geoCache.set(cacheKey, coords);

  return coords;
}

async function geocodePhoton(city: string, countryCode?: string): Promise<GeoCoords | null> {
  try {
    // Request multiple results so we can filter for city/settlement types
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", city);
    url.searchParams.set("limit", "15");
    if (countryCode) url.searchParams.set("countrycode", countryCode.toUpperCase());
    const resp = await fetch(url, {
      headers: { "User-Agent": "LeadFinder/1.0" },
      signal: AbortSignal.timeout(4000),
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
    if (!Array.isArray(features) || features.length === 0) return null;

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

    const wantCC = (countryCode || "").toUpperCase();
    const requestedName = geoCore(city);

    const scored = features.map((f: any) => {
      const props = f?.properties || {};
      const country = String(props.countrycode || "").toUpperCase();
      const type = [props.osm_value, props.type].find((value) => Object.hasOwn(typePriority, value));
      if (!type || (wantCC && country !== wantCC)
        || !validCoordinates(f.geometry?.coordinates?.[1], f.geometry?.coordinates?.[0])) {
        return { feature: f, score: -1 };
      }
      const name = geoCore(String(props.name || ""));
      return { feature: f, score: typePriority[type] + (name === requestedName ? 20 : 0) };
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

async function geocodeNominatim(city: string, countryCode: string): Promise<GeoCoords | null> {
  try {
    // Detect Cyrillic for language/country preference
    const isCyrillic = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(city);
    const lang = isCyrillic ? "uk,en" : "en";

    // Request more results for better filtering
    let url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(city)}&limit=10&addressdetails=1&accept-language=${lang}`;

    const cc = countryCode.toLowerCase().trim();
    if (cc) url += `&countrycodes=${encodeURIComponent(cc)}`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "LeadFinder/1.1 (+https://github.com/bogdanlytvin-ctrl/scanner-sites)",
      },
      signal: AbortSignal.timeout(5000),
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

    if (!Array.isArray(data) || data.length === 0) return null;

    // Priority: city with class=place > administrative boundary > town/village
    const typePriority: Record<string, number> = {
      city: 10,
      town: 7,
      village: 5,
      municipality: 6,
      borough: 4,
      hamlet: 3,
      suburb: 2,
      neighbourhood: 2,
      quarter: 2,
      district: 2,
    };
    // Sub-city subdivisions: a same-named suburb/neighbourhood must not outrank
    // the actual city (e.g. a "São Paulo" suburb in Pará vs. the megacity, which
    // OSM tags as an administrative boundary with no place-bonus).
    const subCityTypes = new Set([
      "suburb", "neighbourhood", "quarter", "locality", "city_block", "allotments",
    ]);
    const qCore = geoCore(city);

    const scored = data.map((r: any) => {
      const type = String(r.addresstype || r.type || "").toLowerCase();
      const cls = String(r.category || r.class || "");
      const country = String(r.address?.country_code || "").toLowerCase();
      const isSettlement = (cls === "place" || cls === "boundary") && typePriority[type];

      // Never use a region, venue or other non-settlement as the city centre.
      if (!isSettlement || (cc && country && cc !== country)
        || !validCoordinates(parseFloat(r.lat), parseFloat(r.lon))) {
        return { result: r, score: -999 };
      }

      let score = typePriority[type] || 0;

      // Bonus for class=place
      if (cls === "place") score += 5;

      // Bonus for importance
      score += (r.importance || 0) * 10;

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
  radiusKm: number = 10,
  countryCode?: string
): Promise<OSMResult[]> {
  // Step 1: Geocode city, then delegate to the coordinate-based search.
  const coords = await geocodeCity(city, countryCode);
  return searchOverpassAt(coords.lat, coords.lng, keyword, maxResults, radiusKm);
}

// Coordinate-based search — used when the caller already has exact coordinates
// (e.g. from the city autocomplete), so no geocoding guess is involved.
export interface DiscoveryResult {
  businesses: OSMResult[];
  source: string;
  note?: string;
  asOf?: string;
}

const SNAPSHOT_REGIONS = [
  { key: "lviv", city: "Львів", lat: 49.84195, lng: 24.03159, aliases: ["львів", "lviv", "львов", "lwów"] },
  { key: "kyiv", city: "Київ", lat: 50.45003, lng: 30.52414, aliases: ["київ", "kyiv", "kiev", "киев"] },
];

export function regionalCity(city: string, country?: string) {
  if (country && country.toLowerCase() !== "ua") return undefined;
  const [name, ...parts] = city.toLowerCase().split(",").map(x => x.trim());
  if (parts.some(x => !["ukraine", "україна", "украина", "ua"].includes(x))) return undefined;
  return SNAPSHOT_REGIONS.find(region => region.aliases.includes(name));
}

type ReadAsset = (path: string) => Promise<Response>;
const readPublishedAsset: ReadAsset = path => fetch(new URL(path, "https://scanner-sites.b-litvin2023.workers.dev"), {
  signal: AbortSignal.timeout(4000), redirect: "error",
});

type SnapshotRow = ["n" | "w", number, number, number, Record<string, string>];

function matchesSelector(tags: Record<string, string>, selector: string): boolean {
  return selector.split("&").every(part => {
    const [key, value] = part.split("=");
    if (!value) return !!tags[key];
    if (key === "cuisine") return tags[key]?.toLowerCase().split(";").some(item => item.trim() === value);
    return tags[key] === value;
  });
}

interface CitySnapshot {
  city: string;
  asOf: string;
  groups: Record<string, string>;
}

type SnapshotRegion = typeof SNAPSHOT_REGIONS[number];
const updatedSnapshots = new Map<string, { snapshot?: CitySnapshot; expires: number }>();

async function parseSnapshot(response: Response, region: SnapshotRegion): Promise<CitySnapshot> {
  if (!response.ok) throw new Error("Регіональні дані тимчасово недоступні.");
  const data = await response.json() as CitySnapshot;
  if (data.city !== region.city || !Number.isFinite(Date.parse(data.asOf)) || !data.groups || !Object.keys(data.groups).length) {
    throw new Error("Некоректний регіональний файл.");
  }
  return data;
}

async function updatedSnapshot(region: SnapshotRegion): Promise<CitySnapshot | undefined> {
  const cached = updatedSnapshots.get(region.key);
  if (cached && cached.expires > Date.now()) return cached.snapshot;
  const url = `https://raw.githubusercontent.com/bogdanlytvin-ctrl/scanner-sites/osm-data/${region.key}-osm.json`;
  try {
    const options = {
      redirect: "error" as const, signal: AbortSignal.timeout(3500),
      cf: { cacheTtl: 3600, cacheEverything: true },
    };
    const response = await fetch(url, options);
    const snapshot = await parseSnapshot(response, region);
    updatedSnapshots.set(region.key, { snapshot, expires: Date.now() + 3600_000 });
    return snapshot;
  } catch {
    updatedSnapshots.set(region.key, { expires: Date.now() + 600_000 });
    return undefined;
  }
}

async function readSnapshot(
  region: typeof SNAPSHOT_REGIONS[number], selectors: string[], namePattern: string | undefined,
  lat: number, lng: number, radius: number, readAsset: ReadAsset,
) {
  let bundled: CitySnapshot | undefined;
  try {
    bundled = await parseSnapshot(await readAsset(`/osm/${region.key}-osm.json`), region);
  } catch { /* The independent data branch can serve a missing bundled asset. */ }
  const extract = (snapshot: CitySnapshot) => filterSnapshot(snapshot, selectors, namePattern, lat, lng, radius);
  if (!bundled || Date.now() - Date.parse(bundled.asOf) > 5 * 86_400_000) {
    const updated = await updatedSnapshot(region);
    if (updated && (!bundled || Date.parse(updated.asOf) > Date.parse(bundled.asOf))) {
      try {
        return await extract(updated);
      } catch {
        updatedSnapshots.set(region.key, { expires: Date.now() + 600_000 });
      }
    }
  }
  if (!bundled) throw new Error("Немає доступної регіональної вибірки.");
  return extract(bundled);
}

async function filterSnapshot(
  snapshot: CitySnapshot, selectors: string[], namePattern: string | undefined,
  lat: number, lng: number, radius: number,
) {
  const elements: Array<{type: string; id: number; lat: number; lon: number; tags: Record<string,string>}> = [];
  // Each compressed group contains exactly the specified set of category tags.
  // Other tags (cuisine, names, contacts) are checked on the individual place.
  const indexedKeys = new Set(["shop", "amenity", "healthcare", "craft", "office", "tourism", "leisure"]);
  for (const [key, encoded] of Object.entries(snapshot.groups)) {
    const index = JSON.parse(key) as Record<string,string>;
    const relevant = selectors.some(selector => selector.split("&").every(part => {
      const key = part.split("=")[0];
      return !indexedKeys.has(key) || matchesSelector(index, part);
    }));
    if (!relevant) continue;
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const rows = await new Response(stream).json() as SnapshotRow[];
    for (const [kind, id, y, x, tags] of rows) {
      if ((!namePattern || normalizeKeyword(tags.name).includes(namePattern))
          && selectors.some(selector => matchesSelector(tags, selector))
          && distanceKm(lat, lng, y, x) <= radius) {
        elements.push({ type: kind === "n" ? "node" : "way", id, lat: y, lon: x, tags });
      }
    }
  }
  return { elements, asOf: snapshot.asOf };
}

export async function discoverBusinessesAt(
  lat: number, lng: number, keyword: string, maxResults = 20, radiusKm = 10,
  preferSites = false, readAsset: ReadAsset = readPublishedAsset,
): Promise<DiscoveryResult> {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return { businesses: [], source: "OpenStreetMap" };
  const tags = resolveKeyword(keyword);
  const stem = ukStem(normalized);
  const namePattern = tags ? undefined : (stem.length >= 4 ? stem : normalized);
  const selectors = tags || BROAD_BUSINESS_TAGS;
  const radius = Math.min(50, radiusKm);
  const pool = Math.min(Math.max(maxResults * 6, 120), 400);
  const select = (elements: any[]) => {
    const ranked = rankLeads(parseOverpassResults(elements), lat, lng, radius);
    if (!preferSites) return pageLeads(ranked, maxResults);
    const priority = (item: OSMResult) => {
      const site = item.website !== "N/A" && !!item.website;
      const contact = (!!item.phone && item.phone !== "N/A") || !!(item.email || item.facebook || item.instagram);
      return (site ? 2 : 0) + (contact ? 1 : 0);
    };
    return ranked.sort((a, b) => priority(b) - priority(a)).slice(0, maxResults);
  };
  const region = SNAPSHOT_REGIONS.find(region => distanceKm(lat, lng, region.lat, region.lng) <= 20);
  let regional: DiscoveryResult | undefined;
  if (region) {
    try {
      const snapshot = await readSnapshot(region, selectors, namePattern, lat, lng, radius, readAsset);
      regional = {
        businesses: select(snapshot.elements),
        source: `OpenStreetMap · ${region.city} · ${snapshot.asOf.slice(0,10)}`, asOf: snapshot.asOf,
        note: `Регіональна вибірка відкритих даних на ${snapshot.asOf.slice(0,10)}. Покриття — вибрані категорії в межах 20 км від центру (${region.city}); позначки на мапі можуть бути неповними.`,
      };
      const fullyInside = distanceKm(lat, lng, region.lat, region.lng) + radius <= 20;
      if (regional.businesses.length && fullyInside && Date.now() - Date.parse(snapshot.asOf) < 7 * 86_400_000) return regional;
    } catch {
      // Cloudflare serves snapshots as static assets. If one is unavailable,
      // continue to the live source rather than treating this as an empty result.
    }
  }
  try {
    const elements = await executeQuery(buildSearchQuery(selectors, lat, lng, radius, pool, namePattern));
    return { businesses: select(elements), source: "OpenStreetMap (Overpass)" };
  } catch (err) {
    if (regional?.businesses.length) return regional;
    throw err;
  }
}

export async function searchOverpassAt(
  lat: number,
  lng: number,
  keyword: string,
  maxResults: number = 20,
  radiusKm: number = 10
): Promise<OSMResult[]> {
  return (await discoverBusinessesAt(lat, lng, keyword, maxResults, radiusKm)).businesses;
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

  const siteQuota = Math.min(sites.length, maxResults - 1, Math.max(1, Math.floor(maxResults * 0.25)));
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
function rankLeads(leads: OSMResult[], lat: number, lng: number, radiusKm: number): OSMResult[] {
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
  return leads
    .map((lead) => ({ lead, tier: tier(lead), distance: distanceKm(lat, lng, lead.lat, lead.lng) }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.tier - b.tier || a.distance - b.distance)
    .map(({ lead }) => lead);
}

function distanceKm(lat: number, lng: number, otherLat: number, otherLng: number): number {
  const radians = Math.PI / 180;
  const halfLat = (otherLat - lat) * radians / 2;
  const halfLng = (otherLng - lng) * radians / 2;
  const a = Math.sin(halfLat) ** 2
    + Math.cos(lat * radians) * Math.cos(otherLat * radians) * Math.sin(halfLng) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ─── Query builders ─────────────────────────────────────────

function buildSearchQuery(
  tags: string[],
  lat: number,
  lng: number,
  radiusKm: number,
  pool: number,
  namePattern?: string,
): string {
  const radius = Math.min(radiusKm * 1000, 50000);
  const nameFilter = namePattern
    ? `["name"~${JSON.stringify(namePattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))},i]`
    : '["name"]';
  const selectors = tags.map((tag) => {
    // Selectors in the same entry are ANDed; different entries are alternatives.
    const filters = tag.split("&").map((part) => {
      const [key, value] = part.split("=");
      if (!value) return `["${key}"]`;
      if (key === "cuisine") return `["cuisine"~"(^|;) *${value} *(;|$)",i]`;
      return `["${key}"="${value}"]`;
    }).join("");
    return `nwr${filters}${nameFilter}(around:${radius},${lat},${lng});`;
  });

  return `[out:json][timeout:25];\n(\n  ${selectors.join("\n  ")}\n);\nout center qt ${pool};`;
}

// Two independent full-planet services, one attempt each with a bounded wait.
const PER_REQUEST_TIMEOUT_MS = 7000;

async function fetchFromEndpoint(endpoint: string, query: string): Promise<any[]> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "LeadFinder/1.1 (+https://github.com/bogdanlytvin-ctrl/scanner-sites)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
    throw new Error("Сервіс Overpass тимчасово недоступний.");
  }
  const data = await response.json();
  if (!Array.isArray(data?.elements) || data.remark) {
    throw new Error("Сервіс Overpass повернув неповні дані.");
  }
  return data.elements;
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

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const elements = await fetchFromEndpoint(endpoint, query);
      setCachedOverpass(query, elements);
      await setCachedEdge(query, elements);
      return elements;
    } catch {
      // Try the other full-planet service only after the first failed.
    }
  }
  throw new Error("Джерело OpenStreetMap тимчасово недоступне. Повторіть пошук пізніше.");
}

// ─── Parse results ──────────────────────────────────────────

function parseOverpassResults(elements: any[]): OSMResult[] {
  const results: OSMResult[] = [];
  const seen = new Set<string>();
  const atLocation = new Map<string, OSMResult>();

  for (const el of elements) {
    const name = typeof el?.tags?.name === "string" ? el.tags.name.trim() : "";
    if (!name) continue;

    // Coordinates: nodes have lat/lon directly, ways have center
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!validCoordinates(lat, lng)) continue;

    // Preserve separate branches of the same business. Repeated OSM objects
    // have the same type/id even when selected via several category tags.
    const osmId = Number.isSafeInteger(el.id) ? `${el.type}/${el.id}` : "";
    const dedupKey = osmId || `${name.toLowerCase()}@${lat},${lng}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const contacts = extractContacts(el.tags);

    const lead: OSMResult = {
      osmId,
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
      type: el.tags?.amenity || el.tags?.shop || el.tags?.craft || el.tags?.office || el.tags?.tourism || el.tags?.healthcare || "business",
    };

    // Merge an overlapping outline and point for the same named place while
    // keeping separate OSM objects for nearby branches and different addresses.
    const locationKey = `${name.toLowerCase()}@${lat.toFixed(4)},${lng.toFixed(4)}`;
    const existing = atLocation.get(locationKey);
    const sameAddress = existing && (
      existing.address === lead.address || existing.address === "N/A" || lead.address === "N/A"
    );
    const sameGeometry = existing?.osmId.split("/")[0] === el.type;
    if (existing && sameAddress && !sameGeometry) {
      const fields = ["phone", "website", "address", "email", "facebook", "instagram", "telegram", "openingHours", "description"] as const;
      for (const field of fields) {
        if (!existing[field] || existing[field] === "N/A") existing[field] = lead[field];
      }
      existing.socialOnly = existing.website === "N/A" && (existing.socialOnly || lead.socialOnly);
      continue;
    }
    if (!existing) atLocation.set(locationKey, lead);
    results.push(lead);
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

// Social platforms that businesses often put in the `website` tag instead of a
// real site. Detecting these lets us reclassify such leads as "social-only".
const SOCIAL_HOSTS: Array<{ re: RegExp; kind: "facebook" | "instagram" | "telegram" | "other" }> = [
  { re: /(?:^|\.)(?:facebook\.com|fb\.(?:com|me))$/i, kind: "facebook" },
  { re: /(?:^|\.)(?:instagram\.com|instagr\.am)$/i, kind: "instagram" },
  { re: /(?:^|\.)(?:t\.me|telegram\.(?:me|org))$/i, kind: "telegram" },
  { re: /(?:^|\.)(?:tiktok\.com|twitter\.com|x\.com|vk\.com|wa\.me|api\.whatsapp\.com|linktr\.ee|taplink\.[a-z]+|youtube\.com|youtu\.be|linkedin\.com)$/i, kind: "other" },
];

function websiteHost(value: string): string | null {
  if (!value || /\s/.test(value)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.includes(".") && !url.username && !url.password
      ? url.hostname.replace(/\.$/, "")
      : null;
  } catch {
    return null;
  }
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
  let website = "N/A";
  let facebook = tags?.["contact:facebook"] || "";
  let instagram = tags?.["contact:instagram"] || "";
  let telegram = tags?.["contact:telegram"] || "";
  let hasSocialLink = !!(facebook || instagram || telegram);

  // A profile in one tag should not hide an independent site in the other.
  for (const entry of [tags?.website, tags?.["contact:website"]].filter(Boolean).join(";").split(";")) {
    const value = entry.trim();
    const host = websiteHost(value);
    if (!host) continue;
    const kind = SOCIAL_HOSTS.find(({ re }) => re.test(host))?.kind;
    if (!kind) {
      if (website === "N/A") website = value;
      continue;
    }
    hasSocialLink = true;
    if (kind === "facebook") facebook ||= value;
    if (kind === "instagram") instagram ||= value;
    if (kind === "telegram") telegram ||= value;
  }

  const socialOnly = website === "N/A" && hasSocialLink;
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
