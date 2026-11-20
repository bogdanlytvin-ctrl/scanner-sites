// Smart Query Parser — extracts city, query (niche), and language from free-text input
// Handles formats like:
//   "dentists in Berlin"           → { city: "Berlin", query: "dentists", language: "en" }
//   "стоматології Київ"           → { city: "Київ", query: "стоматології", language: "ua" }
//   "ресторани у Львові"          → { city: "Львів", query: "ресторани", language: "ua" }
//   "Dnipro, Ukraine lawyer"      → { city: "Dnipro, Ukraine", query: "lawyer", language: "en" }
//   "Berlin"                      → { city: "Berlin", query: "", language: "en" }
//   "юрист"                       → { city: "", query: "юрист", language: "ua" }

export interface ParsedQuery {
  city: string;
  query: string;
  language: "ua" | "en" | "ru" | "other";
}

// ─── Prepositions that separate niche from city ──────────────

const PREPOSITIONS_EN = /\s+(?:in|within|near|at)\s+/iu;
const PREPOSITIONS_UA = /\s+(?:у|в|біля|поблизу|під)\s+/iu;

const CITY_CASES = new Map(Object.entries({
  києві: "Київ", києва: "Київ",
  львові: "Львів", львова: "Львів",
  дніпрі: "Дніпро", дніпра: "Дніпро",
  одесі: "Одеса", одеси: "Одеса",
  харкові: "Харків", харкова: "Харків",
  запоріжжі: "Запоріжжя",
  вінниці: "Вінниця", полтаві: "Полтава",
  чернігові: "Чернігів",
  черкасах: "Черкаси", сумах: "Суми", рівному: "Рівне",
  тернополі: "Тернопіль", хмельницькому: "Хмельницький",
  житомирі: "Житомир", луцьку: "Луцьк", "івано-франківську": "Івано-Франківськ",
  варшаві: "Варшава", кракові: "Краків",
}));

function canonicalCity(city: string): string {
  const [name, ...qualifiers] = city.split(",");
  const normalized = CITY_CASES.get(name.toLowerCase().normalize("NFC").trim()) || name.trim();
  return [normalized, ...qualifiers.map((value) => value.trim())].join(", ");
}

// ─── Built-in list of 20 major cities for disambiguation ─────

const KNOWN_CITIES = new Set([
  // Ukrainian
  "київ", "kyiv", "kiev",
  "львів", "lviv", "lwow",
  "дніпро", "dnipro", "dnepropetrovsk",
  "одеса", "odesa", "odessa",
  "харків", "kharkiv", "kharkov",
  "запоріжжя", "zaporizhzhia", "zaporozhye",
  "вінниця", "vinnitsa",
  "полтава", "poltava",
  "чернігів", "chernihiv",
  "черкаси", "cherkasy",
  "суми", "sumy",
  "рівне", "rivne",
  "тернопіль", "ternopil",
  "хмельницький", "khmelnytskyi",
  "житомир", "zhytomyr",
  "луцьк", "lutsk",
  "івано-франківськ", "ivano-frankivsk",
  "україна", "ukraine",
  // International
  "london", "berlin", "paris", "prague", "praga",
  "warsaw", "варшава", "краків", "krakow",
  "москва", "moscow", "мінськ", "minsk",
  "new york", "токіо", "tokyo",
]);

// ─── Language detection ──────────────────────────────────────

function detectLanguage(text: string): ParsedQuery["language"] {
  // Check for Cyrillic characters
  const cyrillicMatch = text.match(/[а-яА-ЯёЁіІїЇєЄґҐ]/g);
  const latinMatch = text.match(/[a-zA-Z]/g);

  if (!cyrillicMatch && !latinMatch) return "other";

  const cyrillicCount = cyrillicMatch ? cyrillicMatch.length : 0;
  const latinCount = latinMatch ? latinMatch.length : 0;

  // If predominantly Cyrillic
  if (cyrillicCount > latinCount) {
    // Check for Ukrainian-specific characters
    const hasUkrainianChars = /[іїєґЇІЄҐ]/.test(text);
    if (hasUkrainianChars) return "ua";
    // Check for common Ukrainian words
    const ukrainianWords = /(?:^|[^\p{L}])(?:у|біля|поблизу|місто|з|від|це|і|або|але)(?:$|[^\p{L}])/iu;
    if (ukrainianWords.test(text)) return "ua";
    // Default Cyrillic without Ukrainian markers → Russian
    return "ru";
  }

  // If predominantly Latin
  if (latinCount >= cyrillicCount) return "en";

  return "other";
}

// ─── Main parser ─────────────────────────────────────────────

export function parseQuery(input: string): ParsedQuery {
  const trimmed = input.trim();
  if (!trimmed) return { city: "", query: "", language: "other" };

  const language = detectLanguage(trimmed);

  // Split once so qualifiers and multi-word city names stay intact.
  const separator = PREPOSITIONS_UA.exec(trimmed) || PREPOSITIONS_EN.exec(trimmed);
  if (separator) {
    const niche = trimmed.slice(0, separator.index).trim();
    const city = canonicalCity(trimmed.slice(separator.index + separator[0].length).trim());
    if (niche && city) return { city, query: niche, language };
  }

  // ── Strategy 3: Split by comma ──
  const commaParts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    // "Dnipro, Ukraine lawyer" → city is everything except last part, query is last
    const lastPart = commaParts[commaParts.length - 1];
    const cityParts = commaParts.slice(0, -1);

    // Check if last part is a known city → then it IS the city
    if (KNOWN_CITIES.has(canonicalCity(lastPart).toLowerCase())) {
      return { city: canonicalCity(lastPart), query: cityParts.join(", "), language };
    }

    // Check if first part is a known city → then it IS the city
    if (KNOWN_CITIES.has(cityParts[0].toLowerCase())) {
      const qualifier = /^(Ukraine|Україна)\s+(.+)$/iu.exec(lastPart);
      if (qualifier) {
        return { city: [...cityParts, qualifier[1]].join(", "), query: qualifier[2], language };
      }
      return { city: canonicalCity(cityParts.join(", ")), query: lastPart, language };
    }

    // Default: last part is query, rest is city
    return { city: cityParts.join(", "), query: lastPart, language };
  }

  const knownCity = canonicalCity(trimmed);
  if (KNOWN_CITIES.has(knownCity.toLowerCase())) {
    return { city: knownCity, query: "", language };
  }

  // ── Strategy 4: Split by multiple spaces (2+ words) ──
  const spaceParts = trimmed.split(/\s+/).filter(Boolean);
  if (spaceParts.length >= 2) {
    // Prefer a recognized two-word city over token-level heuristics.
    const firstTwo = spaceParts.slice(0, 2).join(" ");
    const lastTwo = spaceParts.slice(-2).join(" ");
    if (KNOWN_CITIES.has(firstTwo.toLowerCase())) {
      return { city: firstTwo, query: spaceParts.slice(2).join(" "), language };
    }
    if (KNOWN_CITIES.has(lastTwo.toLowerCase())) {
      return { city: lastTwo, query: spaceParts.slice(0, -2).join(" "), language };
    }
    // Check if first word looks like a known city
    const firstCity = canonicalCity(spaceParts[0]);
    if (KNOWN_CITIES.has(firstCity.toLowerCase())) {
      return { city: firstCity, query: spaceParts.slice(1).join(" "), language };
    }
    // Check if last word looks like a known city
    const lastCity = canonicalCity(spaceParts[spaceParts.length - 1]);
    if (KNOWN_CITIES.has(lastCity.toLowerCase())) {
      return { city: lastCity, query: spaceParts.slice(0, -1).join(" "), language };
    }

    // Check if any middle word is a known city
    for (let i = 1; i < spaceParts.length - 1; i++) {
      if (KNOWN_CITIES.has(spaceParts[i].toLowerCase())) {
        const before = spaceParts.slice(0, i).join(" ");
        const after = spaceParts.slice(i + 1).join(" ");
        // City includes the matched word + any country qualifiers after it
        const cityStr = after ? `${spaceParts[i]} ${after}` : spaceParts[i];
        return { city: cityStr, query: before, language };
      }
    }

    // Default for 2+ words without known cities: first word = niche, rest = city
    // This handles "dentists Berlin" and "стоматології Київ"
    const firstWord = spaceParts[0];
    const rest = spaceParts.slice(1).join(" ");

    // Heuristic: if first word is lowercase (likely a niche keyword), not a city
    if (firstWord[0] === firstWord[0].toLowerCase() && !KNOWN_CITIES.has(firstWord.toLowerCase())) {
      return { city: rest, query: firstWord, language };
    }

    // If first word is capitalized (likely a city name), rest is niche
    if (firstWord[0] === firstWord[0].toUpperCase()) {
      return { city: firstWord, query: rest, language };
    }

    // Fallback: first word = niche, rest = city
    return { city: rest, query: firstWord, language };
  }

  return { city: "", query: trimmed, language };
}
