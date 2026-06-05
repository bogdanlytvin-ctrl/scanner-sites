// Full ISO-3166 country list with Ukrainian names. `code` is the ISO-3166-1
// alpha-2 code used to restrict geocoding (Nominatim `countrycodes`) and to
// derive the flag emoji at render time.

export interface Country {
  code: string; // ISO alpha-2, lowercase
  name: string; // Ukrainian name
}

// Flag emoji from a 2-letter country code via regional indicator symbols.
export function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  const c = code.toUpperCase();
  return String.fromCodePoint(A + (c.charCodeAt(0) - 65), A + (c.charCodeAt(1) - 65));
}

// ── Top niches per country ──────────────────────────────────────────────
// When a country is picked, the search form offers these as one-click niche
// chips (no manual typing). Each token MUST be a key in osm-search KEYWORD_MAP
// so it resolves to real OSM tags and returns leads. Lists are curated per
// market: Gulf = real-estate/tourism heavy, US/UK/AU = trades & pro-services,
// Mediterranean = hospitality, etc. Unlisted countries fall back to DEFAULT.
export const DEFAULT_NICHES = [
  "restaurant", "cafe", "beauty", "dentist", "lawyer",
  "car_repair", "gym", "hotel", "real_estate", "pharmacy",
];

export const COUNTRY_NICHES: Record<string, string[]> = {
  // Gulf / MENA — luxury, real estate, tourism, personal services
  ae: ["real_estate", "restaurant", "beauty", "dentist", "car_repair", "hotel", "gym", "clinic", "lawyer", "travel"],
  sa: ["real_estate", "restaurant", "car_repair", "beauty", "dentist", "clinic", "gym", "hotel", "jewelry", "travel"],
  qa: ["real_estate", "restaurant", "hotel", "beauty", "dentist", "car_repair", "gym", "clinic", "travel", "lawyer"],
  kw: ["restaurant", "beauty", "real_estate", "car_repair", "dentist", "gym", "clinic", "hotel", "jewelry", "cafe"],
  bh: ["restaurant", "beauty", "real_estate", "dentist", "car_repair", "gym", "hotel", "clinic", "cafe", "lawyer"],
  om: ["hotel", "restaurant", "real_estate", "car_repair", "beauty", "dentist", "travel", "gym", "clinic", "cafe"],
  eg: ["restaurant", "hotel", "travel", "beauty", "car_repair", "dentist", "real_estate", "gym", "cafe", "lawyer"],
  tr: ["restaurant", "hotel", "beauty", "dentist", "car_repair", "real_estate", "gym", "cafe", "jewelry", "lawyer"],
  ma: ["restaurant", "hotel", "cafe", "beauty", "car_repair", "real_estate", "dentist", "travel", "gym", "jewelry"],

  // North America — trades & professional services
  us: ["dentist", "lawyer", "plumber", "restaurant", "gym", "beauty", "car_repair", "real_estate", "accountant", "veterinary"],
  ca: ["dentist", "restaurant", "plumber", "lawyer", "gym", "beauty", "car_repair", "real_estate", "accountant", "veterinary"],
  mx: ["restaurant", "beauty", "dentist", "car_repair", "hotel", "real_estate", "gym", "lawyer", "cafe", "pharmacy"],

  // Western Europe
  gb: ["restaurant", "cafe", "dentist", "plumber", "beauty", "lawyer", "gym", "car_repair", "real_estate", "electrician"],
  ie: ["restaurant", "cafe", "dentist", "plumber", "beauty", "lawyer", "gym", "car_repair", "real_estate", "electrician"],
  de: ["restaurant", "bakery", "dentist", "lawyer", "car_repair", "beauty", "plumber", "real_estate", "gym", "accountant"],
  fr: ["restaurant", "cafe", "bakery", "beauty", "dentist", "lawyer", "real_estate", "hotel", "gym", "car_repair"],
  es: ["restaurant", "cafe", "hotel", "beauty", "dentist", "lawyer", "real_estate", "bakery", "gym", "car_repair"],
  it: ["restaurant", "cafe", "hotel", "beauty", "dentist", "bakery", "lawyer", "real_estate", "gym", "car_repair"],
  pt: ["restaurant", "cafe", "hotel", "beauty", "dentist", "real_estate", "lawyer", "bakery", "gym", "car_repair"],
  nl: ["cafe", "restaurant", "dentist", "beauty", "lawyer", "real_estate", "gym", "bakery", "car_repair", "accountant"],
  be: ["restaurant", "cafe", "bakery", "dentist", "beauty", "lawyer", "real_estate", "gym", "car_repair", "accountant"],
  ch: ["restaurant", "dentist", "lawyer", "beauty", "real_estate", "gym", "car_repair", "accountant", "hotel", "architect"],
  at: ["restaurant", "cafe", "bakery", "dentist", "beauty", "lawyer", "hotel", "gym", "car_repair", "real_estate"],

  // Nordics
  se: ["restaurant", "cafe", "dentist", "beauty", "gym", "car_repair", "real_estate", "lawyer", "hairdresser", "accountant"],
  no: ["restaurant", "cafe", "dentist", "beauty", "gym", "car_repair", "real_estate", "hairdresser", "lawyer", "plumber"],
  dk: ["restaurant", "cafe", "dentist", "beauty", "gym", "car_repair", "real_estate", "hairdresser", "bakery", "lawyer"],
  fi: ["restaurant", "cafe", "dentist", "beauty", "gym", "car_repair", "real_estate", "hairdresser", "lawyer", "hotel"],

  // Central & Eastern Europe
  pl: ["restaurant", "beauty", "dentist", "lawyer", "car_repair", "gym", "bakery", "real_estate", "plumber", "pharmacy"],
  cz: ["restaurant", "cafe", "beauty", "dentist", "car_repair", "gym", "real_estate", "lawyer", "hotel", "pharmacy"],
  ua: ["cafe", "restaurant", "beauty", "dentist", "car_repair", "lawyer", "hotel", "gym", "bakery", "pharmacy"],
  ro: ["restaurant", "beauty", "dentist", "car_repair", "gym", "real_estate", "lawyer", "cafe", "hotel", "pharmacy"],
  gr: ["restaurant", "cafe", "hotel", "beauty", "dentist", "car_repair", "real_estate", "gym", "travel", "lawyer"],
  hr: ["restaurant", "cafe", "hotel", "beauty", "dentist", "car_repair", "real_estate", "travel", "gym", "bakery"],

  // Asia-Pacific
  au: ["restaurant", "cafe", "dentist", "plumber", "beauty", "gym", "car_repair", "real_estate", "lawyer", "electrician"],
  nz: ["restaurant", "cafe", "dentist", "plumber", "beauty", "gym", "car_repair", "real_estate", "lawyer", "hotel"],
  sg: ["restaurant", "beauty", "dentist", "gym", "real_estate", "car_repair", "cafe", "lawyer", "clinic", "hotel"],
  in: ["restaurant", "beauty", "dentist", "gym", "real_estate", "car_repair", "hotel", "jewelry", "clinic", "lawyer"],
  jp: ["restaurant", "cafe", "beauty", "dentist", "hairdresser", "gym", "hotel", "car_repair", "real_estate", "bakery"],
  th: ["restaurant", "hotel", "beauty", "massage", "cafe", "car_repair", "real_estate", "dentist", "gym", "travel"],
  my: ["restaurant", "cafe", "beauty", "dentist", "car_repair", "real_estate", "gym", "hotel", "clinic", "travel"],
  id: ["restaurant", "cafe", "beauty", "hotel", "car_repair", "real_estate", "dentist", "gym", "travel", "clinic"],
  ph: ["restaurant", "cafe", "beauty", "dentist", "car_repair", "real_estate", "gym", "hotel", "clinic", "travel"],

  // Latin America
  br: ["restaurant", "beauty", "dentist", "car_repair", "gym", "real_estate", "cafe", "lawyer", "hotel", "pharmacy"],
  ar: ["restaurant", "cafe", "beauty", "dentist", "car_repair", "gym", "real_estate", "lawyer", "hotel", "bakery"],

  // Africa
  za: ["restaurant", "cafe", "dentist", "beauty", "car_repair", "gym", "real_estate", "lawyer", "hotel", "plumber"],
  ng: ["restaurant", "beauty", "hotel", "car_repair", "real_estate", "dentist", "gym", "lawyer", "cafe", "travel"],
};

// Top niches for a country code, falling back to a sensible default list.
export function nichesForCountry(code: string): string[] {
  return COUNTRY_NICHES[code?.toLowerCase()] ?? DEFAULT_NICHES;
}

// ── Localized niche chips ───────────────────────────────────────────────
// Niche chips are shown in the *country's* language with a translation in the
// active UI locale next to them, e.g. PL → "restauracja · ресторан". The value
// actually sent to search stays the canonical English token (a KEYWORD_MAP key
// that reliably resolves to OSM tags everywhere), so display ≠ search.

// Country → primary business language used for chip labels.
export const COUNTRY_LANG: Record<string, string> = {
  ae: "ar", sa: "ar", qa: "ar", kw: "ar", bh: "ar", om: "ar", eg: "ar", ma: "ar",
  tr: "tr",
  us: "en", ca: "en", gb: "en", ie: "en", au: "en", nz: "en", sg: "en", in: "en", za: "en", ng: "en",
  mx: "es", es: "es", ar: "es",
  de: "de", at: "de", ch: "de",
  fr: "fr", be: "fr",
  it: "it",
  pt: "pt", br: "pt",
  nl: "nl",
  se: "sv", no: "no", dk: "da", fi: "fi",
  pl: "pl", cz: "cs", ua: "uk", ro: "ro", gr: "el", hr: "hr",
  jp: "ja", th: "th", my: "ms", id: "id", ph: "tl",
};

// Canonical token → translation in each UI locale (the "переклад поряд").
export const NICHE_TRANSLATIONS: Record<string, { ua: string; en: string; ru: string }> = {
  restaurant:   { ua: "ресторан",     en: "restaurant",     ru: "ресторан" },
  cafe:         { ua: "кафе",         en: "cafe",           ru: "кафе" },
  beauty:       { ua: "салон краси",  en: "beauty salon",   ru: "салон красоты" },
  dentist:      { ua: "стоматолог",   en: "dentist",        ru: "стоматолог" },
  lawyer:       { ua: "юрист",        en: "lawyer",         ru: "юрист" },
  car_repair:   { ua: "автосервіс",   en: "car repair",     ru: "автосервис" },
  gym:          { ua: "спортзал",     en: "gym",            ru: "спортзал" },
  hotel:        { ua: "готель",       en: "hotel",          ru: "отель" },
  real_estate:  { ua: "нерухомість",  en: "real estate",    ru: "недвижимость" },
  pharmacy:     { ua: "аптека",       en: "pharmacy",       ru: "аптека" },
  clinic:       { ua: "клініка",      en: "clinic",         ru: "клиника" },
  travel:       { ua: "турагентство", en: "travel agency",  ru: "турагентство" },
  jewelry:      { ua: "ювелірний",    en: "jewelry",        ru: "ювелирный" },
  bakery:       { ua: "пекарня",      en: "bakery",         ru: "пекарня" },
  accountant:   { ua: "бухгалтер",    en: "accountant",     ru: "бухгалтер" },
  veterinary:   { ua: "ветеринар",    en: "veterinary",     ru: "ветеринар" },
  plumber:      { ua: "сантехнік",    en: "plumber",        ru: "сантехник" },
  electrician:  { ua: "електрик",     en: "electrician",    ru: "электрик" },
  architect:    { ua: "архітектор",   en: "architect",      ru: "архитектор" },
  hairdresser:  { ua: "перукарня",    en: "hairdresser",    ru: "парикмахерская" },
  massage:      { ua: "масаж",        en: "massage",        ru: "массаж" },
};

// Local-language label per language code. Order of tokens mirrors the keys in
// NICHE_TRANSLATIONS. A missing entry falls back to the English translation.
export const NICHE_LOCAL: Record<string, Record<string, string>> = {
  en: { restaurant: "restaurant", cafe: "cafe", beauty: "beauty salon", dentist: "dentist", lawyer: "lawyer", car_repair: "car repair", gym: "gym", hotel: "hotel", real_estate: "real estate", pharmacy: "pharmacy", clinic: "clinic", travel: "travel agency", jewelry: "jewelry", bakery: "bakery", accountant: "accountant", veterinary: "veterinary", plumber: "plumber", electrician: "electrician", architect: "architect", hairdresser: "hairdresser", massage: "massage" },
  uk: { restaurant: "ресторан", cafe: "кафе", beauty: "салон краси", dentist: "стоматолог", lawyer: "юрист", car_repair: "автосервіс", gym: "спортзал", hotel: "готель", real_estate: "нерухомість", pharmacy: "аптека", clinic: "клініка", travel: "турагентство", jewelry: "ювелірний", bakery: "пекарня", accountant: "бухгалтер", veterinary: "ветеринар", plumber: "сантехнік", electrician: "електрик", architect: "архітектор", hairdresser: "перукарня", massage: "масаж" },
  de: { restaurant: "Restaurant", cafe: "Café", beauty: "Kosmetiksalon", dentist: "Zahnarzt", lawyer: "Anwalt", car_repair: "Autowerkstatt", gym: "Fitnessstudio", hotel: "Hotel", real_estate: "Immobilien", pharmacy: "Apotheke", clinic: "Klinik", travel: "Reisebüro", jewelry: "Juwelier", bakery: "Bäckerei", accountant: "Buchhalter", veterinary: "Tierarzt", plumber: "Klempner", electrician: "Elektriker", architect: "Architekt", hairdresser: "Friseur", massage: "Massage" },
  fr: { restaurant: "Restaurant", cafe: "Café", beauty: "Salon de beauté", dentist: "Dentiste", lawyer: "Avocat", car_repair: "Garage auto", gym: "Salle de sport", hotel: "Hôtel", real_estate: "Immobilier", pharmacy: "Pharmacie", clinic: "Clinique", travel: "Agence de voyage", jewelry: "Bijouterie", bakery: "Boulangerie", accountant: "Comptable", veterinary: "Vétérinaire", plumber: "Plombier", electrician: "Électricien", architect: "Architecte", hairdresser: "Coiffeur", massage: "Massage" },
  es: { restaurant: "Restaurante", cafe: "Cafetería", beauty: "Salón de belleza", dentist: "Dentista", lawyer: "Abogado", car_repair: "Taller mecánico", gym: "Gimnasio", hotel: "Hotel", real_estate: "Inmobiliaria", pharmacy: "Farmacia", clinic: "Clínica", travel: "Agencia de viajes", jewelry: "Joyería", bakery: "Panadería", accountant: "Contador", veterinary: "Veterinario", plumber: "Fontanero", electrician: "Electricista", architect: "Arquitecto", hairdresser: "Peluquería", massage: "Masaje" },
  it: { restaurant: "Ristorante", cafe: "Caffè", beauty: "Salone di bellezza", dentist: "Dentista", lawyer: "Avvocato", car_repair: "Officina auto", gym: "Palestra", hotel: "Hotel", real_estate: "Immobiliare", pharmacy: "Farmacia", clinic: "Clinica", travel: "Agenzia viaggi", jewelry: "Gioielleria", bakery: "Panificio", accountant: "Commercialista", veterinary: "Veterinario", plumber: "Idraulico", electrician: "Elettricista", architect: "Architetto", hairdresser: "Parrucchiere", massage: "Massaggio" },
  pt: { restaurant: "Restaurante", cafe: "Café", beauty: "Salão de beleza", dentist: "Dentista", lawyer: "Advogado", car_repair: "Oficina mecânica", gym: "Academia", hotel: "Hotel", real_estate: "Imobiliária", pharmacy: "Farmácia", clinic: "Clínica", travel: "Agência de viagens", jewelry: "Joalheria", bakery: "Padaria", accountant: "Contador", veterinary: "Veterinário", plumber: "Encanador", electrician: "Eletricista", architect: "Arquiteto", hairdresser: "Cabeleireiro", massage: "Massagem" },
  nl: { restaurant: "Restaurant", cafe: "Café", beauty: "Schoonheidssalon", dentist: "Tandarts", lawyer: "Advocaat", car_repair: "Autogarage", gym: "Sportschool", hotel: "Hotel", real_estate: "Vastgoed", pharmacy: "Apotheek", clinic: "Kliniek", travel: "Reisbureau", jewelry: "Juwelier", bakery: "Bakkerij", accountant: "Boekhouder", veterinary: "Dierenarts", plumber: "Loodgieter", electrician: "Elektricien", architect: "Architect", hairdresser: "Kapper", massage: "Massage" },
  pl: { restaurant: "Restauracja", cafe: "Kawiarnia", beauty: "Salon piękności", dentist: "Dentysta", lawyer: "Prawnik", car_repair: "Warsztat samochodowy", gym: "Siłownia", hotel: "Hotel", real_estate: "Nieruchomości", pharmacy: "Apteka", clinic: "Klinika", travel: "Biuro podróży", jewelry: "Jubiler", bakery: "Piekarnia", accountant: "Księgowy", veterinary: "Weterynarz", plumber: "Hydraulik", electrician: "Elektryk", architect: "Architekt", hairdresser: "Fryzjer", massage: "Masaż" },
  cs: { restaurant: "Restaurace", cafe: "Kavárna", beauty: "Kosmetický salon", dentist: "Zubař", lawyer: "Advokát", car_repair: "Autoservis", gym: "Posilovna", hotel: "Hotel", real_estate: "Reality", pharmacy: "Lékárna", clinic: "Klinika", travel: "Cestovní kancelář", jewelry: "Klenotnictví", bakery: "Pekárna", accountant: "Účetní", veterinary: "Veterinář", plumber: "Instalatér", electrician: "Elektrikář", architect: "Architekt", hairdresser: "Kadeřnictví", massage: "Masáž" },
  ro: { restaurant: "Restaurant", cafe: "Cafenea", beauty: "Salon de înfrumusețare", dentist: "Dentist", lawyer: "Avocat", car_repair: "Service auto", gym: "Sală de fitness", hotel: "Hotel", real_estate: "Imobiliare", pharmacy: "Farmacie", clinic: "Clinică", travel: "Agenție de turism", jewelry: "Bijuterie", bakery: "Brutărie", accountant: "Contabil", veterinary: "Veterinar", plumber: "Instalator", electrician: "Electrician", architect: "Arhitect", hairdresser: "Coafor", massage: "Masaj" },
  hr: { restaurant: "Restoran", cafe: "Kafić", beauty: "Kozmetički salon", dentist: "Zubar", lawyer: "Odvjetnik", car_repair: "Autoservis", gym: "Teretana", hotel: "Hotel", real_estate: "Nekretnine", pharmacy: "Ljekarna", clinic: "Klinika", travel: "Putnička agencija", jewelry: "Zlatarna", bakery: "Pekarnica", accountant: "Računovođa", veterinary: "Veterinar", plumber: "Vodoinstalater", electrician: "Električar", architect: "Arhitekt", hairdresser: "Frizer", massage: "Masaža" },
  sv: { restaurant: "Restaurang", cafe: "Café", beauty: "Skönhetssalong", dentist: "Tandläkare", lawyer: "Advokat", car_repair: "Bilverkstad", gym: "Gym", hotel: "Hotell", real_estate: "Fastigheter", pharmacy: "Apotek", clinic: "Klinik", travel: "Resebyrå", jewelry: "Juvelerare", bakery: "Bageri", accountant: "Revisor", veterinary: "Veterinär", plumber: "Rörmokare", electrician: "Elektriker", architect: "Arkitekt", hairdresser: "Frisör", massage: "Massage" },
  no: { restaurant: "Restaurant", cafe: "Kafé", beauty: "Skjønnhetssalong", dentist: "Tannlege", lawyer: "Advokat", car_repair: "Bilverksted", gym: "Treningssenter", hotel: "Hotell", real_estate: "Eiendom", pharmacy: "Apotek", clinic: "Klinikk", travel: "Reisebyrå", jewelry: "Gullsmed", bakery: "Bakeri", accountant: "Regnskapsfører", veterinary: "Veterinær", plumber: "Rørlegger", electrician: "Elektriker", architect: "Arkitekt", hairdresser: "Frisør", massage: "Massasje" },
  da: { restaurant: "Restaurant", cafe: "Café", beauty: "Skønhedssalon", dentist: "Tandlæge", lawyer: "Advokat", car_repair: "Autoværksted", gym: "Fitnesscenter", hotel: "Hotel", real_estate: "Ejendomsmægler", pharmacy: "Apotek", clinic: "Klinik", travel: "Rejsebureau", jewelry: "Juveler", bakery: "Bageri", accountant: "Revisor", veterinary: "Dyrlæge", plumber: "VVS", electrician: "Elektriker", architect: "Arkitekt", hairdresser: "Frisør", massage: "Massage" },
  fi: { restaurant: "Ravintola", cafe: "Kahvila", beauty: "Kauneushoitola", dentist: "Hammaslääkäri", lawyer: "Lakimies", car_repair: "Autokorjaamo", gym: "Kuntosali", hotel: "Hotelli", real_estate: "Kiinteistöt", pharmacy: "Apteekki", clinic: "Klinikka", travel: "Matkatoimisto", jewelry: "Korusliike", bakery: "Leipomo", accountant: "Kirjanpitäjä", veterinary: "Eläinlääkäri", plumber: "Putkimies", electrician: "Sähköasentaja", architect: "Arkkitehti", hairdresser: "Parturi-kampaamo", massage: "Hieronta" },
  el: { restaurant: "Εστιατόριο", cafe: "Καφετέρια", beauty: "Σαλόνι ομορφιάς", dentist: "Οδοντίατρος", lawyer: "Δικηγόρος", car_repair: "Συνεργείο αυτοκινήτων", gym: "Γυμναστήριο", hotel: "Ξενοδοχείο", real_estate: "Ακίνητα", pharmacy: "Φαρμακείο", clinic: "Κλινική", travel: "Ταξιδιωτικό γραφείο", jewelry: "Κοσμηματοπωλείο", bakery: "Αρτοποιείο", accountant: "Λογιστής", veterinary: "Κτηνίατρος", plumber: "Υδραυλικός", electrician: "Ηλεκτρολόγος", architect: "Αρχιτέκτονας", hairdresser: "Κομμωτήριο", massage: "Μασάζ" },
  tr: { restaurant: "Restoran", cafe: "Kafe", beauty: "Güzellik salonu", dentist: "Diş hekimi", lawyer: "Avukat", car_repair: "Oto tamir", gym: "Spor salonu", hotel: "Otel", real_estate: "Emlak", pharmacy: "Eczane", clinic: "Klinik", travel: "Seyahat acentesi", jewelry: "Kuyumcu", bakery: "Fırın", accountant: "Muhasebeci", veterinary: "Veteriner", plumber: "Tesisatçı", electrician: "Elektrikçi", architect: "Mimar", hairdresser: "Kuaför", massage: "Masaj" },
  ar: { restaurant: "مطعم", cafe: "مقهى", beauty: "صالون تجميل", dentist: "طبيب أسنان", lawyer: "محامٍ", car_repair: "تصليح سيارات", gym: "صالة رياضية", hotel: "فندق", real_estate: "عقارات", pharmacy: "صيدلية", clinic: "عيادة", travel: "وكالة سفر", jewelry: "مجوهرات", bakery: "مخبز", accountant: "محاسب", veterinary: "طبيب بيطري", plumber: "سباك", electrician: "كهربائي", architect: "مهندس معماري", hairdresser: "حلاق", massage: "مساج" },
  ja: { restaurant: "レストラン", cafe: "カフェ", beauty: "エステサロン", dentist: "歯医者", lawyer: "弁護士", car_repair: "自動車修理", gym: "ジム", hotel: "ホテル", real_estate: "不動産", pharmacy: "薬局", clinic: "クリニック", travel: "旅行代理店", jewelry: "宝石店", bakery: "ベーカリー", accountant: "会計士", veterinary: "動物病院", plumber: "配管工", electrician: "電気工事", architect: "建築家", hairdresser: "美容院", massage: "マッサージ" },
  th: { restaurant: "ร้านอาหาร", cafe: "คาเฟ่", beauty: "ร้านเสริมสวย", dentist: "ทันตแพทย์", lawyer: "ทนายความ", car_repair: "อู่ซ่อมรถ", gym: "ฟิตเนส", hotel: "โรงแรม", real_estate: "อสังหาริมทรัพย์", pharmacy: "ร้านขายยา", clinic: "คลินิก", travel: "บริษัททัวร์", jewelry: "ร้านเครื่องประดับ", bakery: "เบเกอรี่", accountant: "นักบัญชี", veterinary: "สัตวแพทย์", plumber: "ช่างประปา", electrician: "ช่างไฟฟ้า", architect: "สถาปนิก", hairdresser: "ร้านทำผม", massage: "นวด" },
  ms: { restaurant: "Restoran", cafe: "Kafe", beauty: "Salun kecantikan", dentist: "Doktor gigi", lawyer: "Peguam", car_repair: "Bengkel kereta", gym: "Gimnasium", hotel: "Hotel", real_estate: "Hartanah", pharmacy: "Farmasi", clinic: "Klinik", travel: "Agensi pelancongan", jewelry: "Kedai emas", bakery: "Kedai roti", accountant: "Akauntan", veterinary: "Veterinar", plumber: "Tukang paip", electrician: "Juruelektrik", architect: "Arkitek", hairdresser: "Pendandan rambut", massage: "Urut" },
  id: { restaurant: "Restoran", cafe: "Kafe", beauty: "Salon kecantikan", dentist: "Dokter gigi", lawyer: "Pengacara", car_repair: "Bengkel mobil", gym: "Gym", hotel: "Hotel", real_estate: "Properti", pharmacy: "Apotek", clinic: "Klinik", travel: "Agen perjalanan", jewelry: "Toko perhiasan", bakery: "Toko roti", accountant: "Akuntan", veterinary: "Dokter hewan", plumber: "Tukang ledeng", electrician: "Tukang listrik", architect: "Arsitek", hairdresser: "Penata rambut", massage: "Pijat" },
  tl: { restaurant: "Restawran", cafe: "Cafe", beauty: "Beauty salon", dentist: "Dentista", lawyer: "Abogado", car_repair: "Talyer ng sasakyan", gym: "Gym", hotel: "Hotel", real_estate: "Real estate", pharmacy: "Botika", clinic: "Klinika", travel: "Travel agency", jewelry: "Alahas", bakery: "Panaderya", accountant: "Accountant", veterinary: "Beterinaryo", plumber: "Tubero", electrician: "Elektrisyan", architect: "Arkitekto", hairdresser: "Parlor", massage: "Masahe" },
};

export interface NicheChip {
  token: string; // canonical KEYWORD_MAP key sent to search
  local: string; // label in the country's language
  label: string; // translation in the active UI locale
}

// Build the niche chips for a country: local-language name + UI-locale
// translation, while the search token stays canonical so leads still resolve.
export function nicheChipsForCountry(code: string, locale: "ua" | "en" | "ru"): NicheChip[] {
  const tokens = nichesForCountry(code);
  const lang = COUNTRY_LANG[code?.toLowerCase()] ?? "en";
  const localMap = NICHE_LOCAL[lang] ?? NICHE_LOCAL.en;
  return tokens.map((token) => {
    const tr = NICHE_TRANSLATIONS[token];
    const fallback = token.replace(/_/g, " ");
    return {
      token,
      local: localMap[token] ?? tr?.en ?? fallback,
      label: tr?.[locale] ?? fallback,
    };
  });
}

// Sorted (UA alphabet) at module load so the dropdown is alphabetical.
export const COUNTRIES: Country[] = [
  { code: "au", name: "Австралія" },
  { code: "at", name: "Австрія" },
  { code: "az", name: "Азербайджан" },
  { code: "al", name: "Албанія" },
  { code: "dz", name: "Алжир" },
  { code: "ao", name: "Ангола" },
  { code: "ad", name: "Андорра" },
  { code: "ar", name: "Аргентина" },
  { code: "am", name: "Вірменія" },
  { code: "af", name: "Афганістан" },
  { code: "bs", name: "Багами" },
  { code: "bd", name: "Бангладеш" },
  { code: "bb", name: "Барбадос" },
  { code: "bh", name: "Бахрейн" },
  { code: "by", name: "Білорусь" },
  { code: "bz", name: "Беліз" },
  { code: "be", name: "Бельгія" },
  { code: "bj", name: "Бенін" },
  { code: "bg", name: "Болгарія" },
  { code: "bo", name: "Болівія" },
  { code: "ba", name: "Боснія і Герцеговина" },
  { code: "bw", name: "Ботсвана" },
  { code: "br", name: "Бразилія" },
  { code: "bn", name: "Бруней" },
  { code: "bf", name: "Буркіна-Фасо" },
  { code: "bi", name: "Бурунді" },
  { code: "bt", name: "Бутан" },
  { code: "vu", name: "Вануату" },
  { code: "va", name: "Ватикан" },
  { code: "gb", name: "Велика Британія" },
  { code: "ve", name: "Венесуела" },
  { code: "vn", name: "В'єтнам" },
  { code: "ga", name: "Габон" },
  { code: "ht", name: "Гаїті" },
  { code: "gy", name: "Гаяна" },
  { code: "gm", name: "Гамбія" },
  { code: "gh", name: "Гана" },
  { code: "gt", name: "Гватемала" },
  { code: "gn", name: "Гвінея" },
  { code: "gw", name: "Гвінея-Бісау" },
  { code: "hn", name: "Гондурас" },
  { code: "gd", name: "Гренада" },
  { code: "gr", name: "Греція" },
  { code: "ge", name: "Грузія" },
  { code: "dk", name: "Данія" },
  { code: "cd", name: "ДР Конго" },
  { code: "dj", name: "Джибуті" },
  { code: "dm", name: "Домініка" },
  { code: "do", name: "Домініканська Республіка" },
  { code: "eg", name: "Єгипет" },
  { code: "ec", name: "Еквадор" },
  { code: "gq", name: "Екваторіальна Гвінея" },
  { code: "er", name: "Еритрея" },
  { code: "ee", name: "Естонія" },
  { code: "sz", name: "Есватіні" },
  { code: "et", name: "Ефіопія" },
  { code: "ye", name: "Ємен" },
  { code: "zm", name: "Замбія" },
  { code: "zw", name: "Зімбабве" },
  { code: "il", name: "Ізраїль" },
  { code: "in", name: "Індія" },
  { code: "id", name: "Індонезія" },
  { code: "iq", name: "Ірак" },
  { code: "ir", name: "Іран" },
  { code: "ie", name: "Ірландія" },
  { code: "is", name: "Ісландія" },
  { code: "es", name: "Іспанія" },
  { code: "it", name: "Італія" },
  { code: "jo", name: "Йорданія" },
  { code: "cv", name: "Кабо-Верде" },
  { code: "kz", name: "Казахстан" },
  { code: "kh", name: "Камбоджа" },
  { code: "cm", name: "Камерун" },
  { code: "ca", name: "Канада" },
  { code: "qa", name: "Катар" },
  { code: "ke", name: "Кенія" },
  { code: "kg", name: "Киргизстан" },
  { code: "cn", name: "Китай" },
  { code: "cy", name: "Кіпр" },
  { code: "ki", name: "Кірибаті" },
  { code: "co", name: "Колумбія" },
  { code: "km", name: "Коморські Острови" },
  { code: "cg", name: "Конго" },
  { code: "cr", name: "Коста-Рика" },
  { code: "ci", name: "Кот-д'Івуар" },
  { code: "cu", name: "Куба" },
  { code: "kw", name: "Кувейт" },
  { code: "la", name: "Лаос" },
  { code: "lv", name: "Латвія" },
  { code: "ls", name: "Лесото" },
  { code: "lt", name: "Литва" },
  { code: "lr", name: "Ліберія" },
  { code: "lb", name: "Ліван" },
  { code: "ly", name: "Лівія" },
  { code: "li", name: "Ліхтенштейн" },
  { code: "lu", name: "Люксембург" },
  { code: "mu", name: "Маврикій" },
  { code: "mr", name: "Мавританія" },
  { code: "mg", name: "Мадагаскар" },
  { code: "mk", name: "Північна Македонія" },
  { code: "mw", name: "Малаві" },
  { code: "my", name: "Малайзія" },
  { code: "ml", name: "Малі" },
  { code: "mv", name: "Мальдіви" },
  { code: "mt", name: "Мальта" },
  { code: "ma", name: "Марокко" },
  { code: "mh", name: "Маршаллові Острови" },
  { code: "mx", name: "Мексика" },
  { code: "mz", name: "Мозамбік" },
  { code: "md", name: "Молдова" },
  { code: "mc", name: "Монако" },
  { code: "mn", name: "Монголія" },
  { code: "mm", name: "М'янма" },
  { code: "na", name: "Намібія" },
  { code: "nr", name: "Науру" },
  { code: "np", name: "Непал" },
  { code: "ne", name: "Нігер" },
  { code: "ng", name: "Нігерія" },
  { code: "nl", name: "Нідерланди" },
  { code: "ni", name: "Нікарагуа" },
  { code: "de", name: "Німеччина" },
  { code: "nz", name: "Нова Зеландія" },
  { code: "no", name: "Норвегія" },
  { code: "ae", name: "ОАЕ" },
  { code: "om", name: "Оман" },
  { code: "pk", name: "Пакистан" },
  { code: "pw", name: "Палау" },
  { code: "ps", name: "Палестина" },
  { code: "pa", name: "Панама" },
  { code: "pg", name: "Папуа Нова Гвінея" },
  { code: "py", name: "Парагвай" },
  { code: "pe", name: "Перу" },
  { code: "za", name: "ПАР" },
  { code: "pl", name: "Польща" },
  { code: "pt", name: "Португалія" },
  { code: "ru", name: "Росія" },
  { code: "rw", name: "Руанда" },
  { code: "ro", name: "Румунія" },
  { code: "sv", name: "Сальвадор" },
  { code: "ws", name: "Самоа" },
  { code: "sm", name: "Сан-Марино" },
  { code: "st", name: "Сан-Томе і Принсіпі" },
  { code: "sa", name: "Саудівська Аравія" },
  { code: "sc", name: "Сейшели" },
  { code: "sn", name: "Сенегал" },
  { code: "vc", name: "Сент-Вінсент і Гренадини" },
  { code: "kn", name: "Сент-Кітс і Невіс" },
  { code: "lc", name: "Сент-Люсія" },
  { code: "rs", name: "Сербія" },
  { code: "sg", name: "Сінгапур" },
  { code: "sy", name: "Сирія" },
  { code: "sk", name: "Словаччина" },
  { code: "si", name: "Словенія" },
  { code: "sb", name: "Соломонові Острови" },
  { code: "so", name: "Сомалі" },
  { code: "sd", name: "Судан" },
  { code: "ss", name: "Південний Судан" },
  { code: "sr", name: "Суринам" },
  { code: "tl", name: "Східний Тимор" },
  { code: "us", name: "США" },
  { code: "sl", name: "Сьєрра-Леоне" },
  { code: "tj", name: "Таджикистан" },
  { code: "th", name: "Таїланд" },
  { code: "tz", name: "Танзанія" },
  { code: "tg", name: "Того" },
  { code: "to", name: "Тонга" },
  { code: "tt", name: "Тринідад і Тобаго" },
  { code: "tv", name: "Тувалу" },
  { code: "tn", name: "Туніс" },
  { code: "tm", name: "Туркменістан" },
  { code: "tr", name: "Туреччина" },
  { code: "ug", name: "Уганда" },
  { code: "hu", name: "Угорщина" },
  { code: "uz", name: "Узбекистан" },
  { code: "ua", name: "Україна" },
  { code: "uy", name: "Уругвай" },
  { code: "fj", name: "Фіджі" },
  { code: "ph", name: "Філіппіни" },
  { code: "fi", name: "Фінляндія" },
  { code: "fr", name: "Франція" },
  { code: "hr", name: "Хорватія" },
  { code: "cf", name: "ЦАР" },
  { code: "td", name: "Чад" },
  { code: "me", name: "Чорногорія" },
  { code: "cz", name: "Чехія" },
  { code: "cl", name: "Чилі" },
  { code: "ch", name: "Швейцарія" },
  { code: "se", name: "Швеція" },
  { code: "lk", name: "Шрі-Ланка" },
  { code: "jm", name: "Ямайка" },
  { code: "jp", name: "Японія" },
].sort((a, b) => a.name.localeCompare(b.name, "uk"));

// Curated major cities per country for the city dropdown. Names only — on pick
// the client resolves exact coordinates via /api/geocode (country-scoped), so we
// never hardcode coordinates that could drift. Countries not listed here simply
// fall back to the type-to-search autocomplete (which covers every settlement).
export const MAJOR_CITIES: Record<string, string[]> = {
  ua: ["Київ", "Харків", "Одеса", "Дніпро", "Львів", "Запоріжжя", "Кривий Ріг", "Миколаїв", "Вінниця", "Полтава", "Чернігів", "Черкаси", "Житомир", "Суми", "Хмельницький", "Чернівці", "Рівне", "Івано-Франківськ", "Тернопіль", "Луцьк", "Ужгород"],
  us: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "Miami", "Atlanta", "Boston", "Seattle", "Denver", "Las Vegas", "San Francisco", "Washington"],
  gb: ["London", "Birmingham", "Manchester", "Glasgow", "Liverpool", "Leeds", "Sheffield", "Edinburgh", "Bristol", "Cardiff", "Belfast", "Newcastle", "Nottingham", "Leicester"],
  ca: ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg", "Quebec City", "Hamilton", "Halifax"],
  au: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Newcastle", "Wollongong", "Hobart"],
  nz: ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Dunedin", "Palmerston North", "Napier"],
  ie: ["Dublin", "Cork", "Limerick", "Galway", "Waterford", "Drogheda", "Kilkenny"],
  de: ["Berlin", "München", "Hamburg", "Köln", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Dresden", "Hannover", "Nürnberg", "Bremen"],
  fr: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Strasbourg", "Montpellier", "Bordeaux", "Lille", "Rennes", "Reims"],
  es: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga", "Murcia", "Bilbao", "Alicante", "Granada", "Palma"],
  it: ["Roma", "Milano", "Napoli", "Torino", "Palermo", "Genova", "Bologna", "Firenze", "Bari", "Catania", "Venezia", "Verona"],
  pt: ["Lisboa", "Porto", "Braga", "Coimbra", "Funchal", "Faro", "Aveiro", "Setúbal"],
  nl: ["Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven", "Groningen", "Tilburg", "Breda", "Nijmegen"],
  be: ["Brussel", "Antwerpen", "Gent", "Charleroi", "Liège", "Brugge", "Namur", "Leuven"],
  ch: ["Zürich", "Genève", "Basel", "Bern", "Lausanne", "Winterthur", "Luzern", "St. Gallen"],
  at: ["Wien", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt", "Villach"],
  pl: ["Warszawa", "Kraków", "Łódź", "Wrocław", "Poznań", "Gdańsk", "Szczecin", "Bydgoszcz", "Lublin", "Katowice", "Białystok", "Rzeszów"],
  cz: ["Praha", "Brno", "Ostrava", "Plzeň", "Liberec", "Olomouc", "České Budějovice", "Hradec Králové"],
  sk: ["Bratislava", "Košice", "Prešov", "Žilina", "Nitra", "Banská Bystrica", "Trnava"],
  hu: ["Budapest", "Debrecen", "Szeged", "Miskolc", "Pécs", "Győr", "Nyíregyháza"],
  ro: ["București", "Cluj-Napoca", "Timișoara", "Iași", "Constanța", "Craiova", "Brașov", "Galați", "Oradea"],
  bg: ["София", "Пловдив", "Варна", "Бургас", "Русе", "Стара Загора"],
  hr: ["Zagreb", "Split", "Rijeka", "Osijek", "Zadar", "Dubrovnik", "Pula"],
  rs: ["Beograd", "Novi Sad", "Niš", "Kragujevac", "Subotica"],
  si: ["Ljubljana", "Maribor", "Celje", "Kranj", "Koper"],
  se: ["Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås", "Örebro", "Linköping", "Helsingborg"],
  no: ["Oslo", "Bergen", "Trondheim", "Stavanger", "Drammen", "Tromsø", "Kristiansand"],
  dk: ["København", "Aarhus", "Odense", "Aalborg", "Esbjerg", "Randers"],
  fi: ["Helsinki", "Espoo", "Tampere", "Vantaa", "Oulu", "Turku", "Jyväskylä"],
  gr: ["Αθήνα", "Θεσσαλονίκη", "Πάτρα", "Ηράκλειο", "Λάρισα", "Βόλος"],
  tr: ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya", "Gaziantep", "Kayseri"],
  ru: ["Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань", "Нижний Новгород", "Челябинск", "Самара", "Ростов-на-Дону", "Краснодар"],
  by: ["Мінськ", "Гомель", "Могильов", "Вітебськ", "Гродно", "Брест"],
  kz: ["Алмати", "Астана", "Шимкент", "Караганда", "Актобе", "Тараз"],
  ge: ["Тбілісі", "Батумі", "Кутаїсі", "Руставі", "Зугдіді"],
  az: ["Баку", "Гянджа", "Сумгаїт", "Мінгечевір"],
  ae: ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain", "Ajman", "Ras Al Khaimah", "Fujairah"],
  sa: ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar", "Taif"],
  qa: ["Doha", "Al Rayyan", "Al Wakrah", "Al Khor"],
  kw: ["Kuwait City", "Hawalli", "Al Ahmadi", "Salmiya"],
  bh: ["Manama", "Riffa", "Muharraq", "Hamad Town"],
  om: ["Muscat", "Salalah", "Sohar", "Nizwa"],
  il: ["Tel Aviv", "Jerusalem", "Haifa", "Rishon LeZion", "Beersheba", "Netanya"],
  eg: ["Cairo", "Alexandria", "Giza", "Luxor", "Aswan", "Hurghada", "Port Said"],
  ma: ["Casablanca", "Rabat", "Marrakesh", "Fez", "Tangier", "Agadir", "Marrakech"],
  za: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth", "Bloemfontein"],
  ng: ["Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt", "Benin City"],
  ke: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
  in: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Surat"],
  jp: ["Tokyo", "Yokohama", "Osaka", "Nagoya", "Sapporo", "Fukuoka", "Kobe", "Kyoto", "Kawasaki"],
  cn: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Chongqing", "Wuhan", "Hangzhou", "Xi'an"],
  th: ["Bangkok", "Chiang Mai", "Pattaya", "Phuket", "Nonthaburi", "Hat Yai"],
  vn: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong", "Can Tho", "Nha Trang"],
  id: ["Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Denpasar"],
  my: ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Shah Alam", "Malacca"],
  sg: ["Singapore"],
  ph: ["Manila", "Quezon City", "Cebu City", "Davao", "Makati", "Pasig"],
  br: ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza", "Belo Horizonte", "Curitiba", "Recife", "Porto Alegre"],
  mx: ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "Cancún", "Mérida", "León"],
  ar: ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata", "Mar del Plata", "Salta"],
  cl: ["Santiago", "Valparaíso", "Concepción", "Antofagasta", "Viña del Mar", "La Serena"],
  co: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga"],
  pe: ["Lima", "Arequipa", "Trujillo", "Cusco", "Chiclayo", "Piura"],
  md: ["Кишинів", "Бєльці", "Тирасполь", "Бендери"],
};

export function citiesForCountry(code: string): string[] {
  return MAJOR_CITIES[code?.toLowerCase()] ?? [];
}
