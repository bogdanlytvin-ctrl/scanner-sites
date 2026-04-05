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

const PREPOSITIONS_EN = /\b(?:in|within|near|at)\b/i;
const PREPOSITIONS_UA = /\b(?:у|в|біля|поблизу|під)\b/i;

// ─── Built-in list of 20 major cities for disambiguation ─────

const KNOWN_CITIES = new Set([
  // Ukrainian
  "київ", "kyiv", "kiev",
  "львів", "lviv", "lwow",
  "дніпро", "dnipro", "dnepropetrovsk",
  "одеса", "odesa", "odessa",
  "харків", "kharkiv", "kharkov",
  "запоріжжя", "zaporizhzhia", "zaporizhzhzhia", "zaporozhye",
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
  "укаїна", "ukraine",
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
    const ukrainianWords = /\b(?:у|в|біля|поблизу|місто|для|не|на|з|від|до|це|і|або|але)\b/i;
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

  // ── Strategy 1: Split by Ukrainian prepositions (у/в/біля/поблизу) ──
  const uaPrepMatch = trimmed.split(PREPOSITIONS_UA);
  if (uaPrepMatch.length >= 2) {
    const niche = uaPrepMatch[0].trim();
    const city = uaPrepMatch.slice(1).join(" ").trim();
    if (niche && city) {
      return { city, query: niche, language };
    }
  }

  // ── Strategy 2: Split by English prepositions (in/within/near) ──
  const enPrepMatch = trimmed.split(PREPOSITIONS_EN);
  if (enPrepMatch.length >= 2) {
    const niche = enPrepMatch[0].trim();
    const city = enPrepMatch.slice(1).join(" ").trim();
    if (niche && city) {
      return { city, query: niche, language };
    }
  }

  // ── Strategy 3: Split by comma ──
  const commaParts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    // "Dnipro, Ukraine lawyer" → city is everything except last part, query is last
    const lastPart = commaParts[commaParts.length - 1];
    const cityParts = commaParts.slice(0, -1);

    // Check if last part is a known city → then it IS the city
    if (KNOWN_CITIES.has(lastPart.toLowerCase())) {
      return { city: lastPart, query: cityParts.join(", "), language };
    }

    // Check if first part is a known city → then it IS the city
    if (KNOWN_CITIES.has(cityParts[0].toLowerCase())) {
      return { city: cityParts.join(", "), query: lastPart, language };
    }

    // Default: last part is query, rest is city
    return { city: cityParts.join(", "), query: lastPart, language };
  }

  // ── Strategy 4: Split by multiple spaces (2+ words) ──
  const spaceParts = trimmed.split(/\s+/).filter(Boolean);
  if (spaceParts.length >= 2) {
    // Check if first word looks like a known city
    if (KNOWN_CITIES.has(spaceParts[0].toLowerCase())) {
      return { city: spaceParts[0], query: spaceParts.slice(1).join(" "), language };
    }
    // Check if last word looks like a known city
    if (KNOWN_CITIES.has(spaceParts[spaceParts.length - 1].toLowerCase())) {
      return { city: spaceParts[spaceParts.length - 1], query: spaceParts.slice(0, -1).join(" "), language };
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

  // ── Strategy 5: Single word ──
  const word = trimmed;
  if (KNOWN_CITIES.has(word.toLowerCase())) {
    return { city: word, query: "", language };
  }

  // Single word, not a known city → treat as niche/query
  return { city: "", query: word, language };
}
