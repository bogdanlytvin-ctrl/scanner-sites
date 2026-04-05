---
## Task ID: lead-generation-platform-enhancement
### Work Task
Implement comprehensive lead generation platform features: outreach templates, lead management, multi-city search, enhanced filtering, design issues section, price estimation, and outreach tools.

### Work Summary
Created/modified the following files:

1. **`/src/lib/outreach-templates.ts`** (NEW): 8 Ukrainian-language outreach templates (formal email, friendly email, Telegram direct, Messenger short, follow-up, urgency/no-website, cold intro, Telegram casual). Includes `getIssuesText()` for generating Ukrainian issue descriptions, `estimatePrice()` for price estimation, `fillTemplate()` for placeholder substitution, and `getTemplates()` for template retrieval.

2. **`/src/lib/scoring.ts`** (MODIFIED): Added `LeadStatus` type, `status`/`notes`/`contactDate` fields to `LeadBusiness` interface. Added `getStatusColor()` and `getStatusList()` helper functions with Ukrainian labels and emojis for all 6 statuses.

3. **`/src/app/api/outreach/route.ts`** (NEW): POST endpoint accepting `templateId`, `lead`, and `city`, returning filled template with subject/body, price estimate, and template metadata.

4. **`/src/app/api/export/route.ts`** (MODIFIED): Added new Excel/CSV columns: Status, Notes, Estimated Price, Price Note, Contact Date, SSL, Technologies, Issues, Design Score.

5. **`/src/app/page.tsx`** (REWRITTEN): Complete rewrite with all features:
   - Multi-city search (comma-separated, sequential API calls, deduplication)
   - Summary dashboard (7 stat cards including average price)
   - Enhanced filters (score + status + "only with issues" toggle)
   - Lead cards with: score/design/status/price badges, two-column expanded layout (screenshots left, details right), mobile screenshots via thum.io
   - Design Issues section with Ukrainian issue descriptions
   - Price estimation display with breakdown
   - Outreach section (template selector, copy email, Telegram link, mailto, preview)
   - Lead management section (status dropdown, contact date, notes textarea)
   - Export buttons (CSV, Excel, HOT-only)
   - Toast notifications
   - Responsive design with dark mode support

---
## Task ID: 1
### Work Task
Fix bugs and add major new features: JSON parse bug fix, search history & favorites, enhanced problem templates, website validity check, Telegram bot integration.

### Work Summary

#### PART 1: Fixed JSON Parse Bug in Geocoders (`/src/lib/osm-search.ts`)
- Modified `geocodePhoton()` to check `resp.headers.get("content-type")` for "json" before calling `.json()`
- Modified `geocodeNominatim()` with the same content-type check
- Both functions now: (1) check content-type includes "json", (2) log warning if not JSON and return null, (3) wrap `.json()` in try/catch returning null on parse errors

#### PART 2: Search History & Favorites (`/src/lib/storage.ts` + page.tsx)
- Created `/src/lib/storage.ts` with:
  - `SearchHistoryEntry` type with id, city, query, maxResults, radius, timestamp, totalResults
  - `getSearchHistory()`, `saveSearchHistory()`, `removeSearchHistoryItem()`, `clearSearchHistory()`
  - `getFavorites()`, `toggleFavorite()`, `isFavorite()`
  - `TelegramSettings` type and `getTelegramSettings()`, `saveTelegramSettings()`
- Modified page.tsx to add:
  - **Search History panel**: collapsible section below search form showing last 20 searches, click to re-run, individual delete, "Clear All" button
  - **Favorites system**: Star icon on each lead card header, click to toggle, favorites persist in localStorage, "Only Favorites" filter toggle in filters bar
  - History and favorites loaded on mount via useEffect

#### PART 3: Enhanced Problem Templates (`/src/lib/outreach-templates.ts`)
- Added `ProblemType` interface with id, icon, problem, description, solution, benefits[], priceRange, detectCondition
- Added `getProblemLibrary()` returning 10 problem types:
  1. No website at all (🚫)
  2. Very old design ≤ 2016 (📅)
  3. Not mobile-friendly (📱)
  4. No SSL certificate (🔒)
  5. Outdated technology - Joomla/Drupal/uCoz/1C-Bitrix (🔧)
  6. No contact form (📋)
  7. Table-based layout (📐)
  8. Missing SEO meta tags (🔍)
  9. No social media links (🔗)
  10. Slow loading / inline styles (🎨)
- Added `getProblemsForLead(lead)` function that checks lead data against all problems
- Updated `getIssuesText()` to use problem library for richer issue descriptions
- Problem Library Details section added to expanded lead cards showing each problem with solution, benefits, and price range

#### PART 4: Website Validity Check (`/src/lib/website-analyzer.ts`)
- Added `WorthinessResult` interface: { worth: boolean, reason: string, score: number }
- Added `isWorthContacting(lead)` function with scoring:
  - No website: score 95 (best prospect)
  - Ancient design: +30
  - Not mobile: +20
  - No SSL: +10
  - Old tech: +15
  - No contact form: +10
  - Table-based: +10
  - Modern site: penalized to ≤25
  - worth = true if score ≥ 40
- "Contact Worthiness" badge (ThumbsUp/ThumbsDown + score/100) added to each lead card header

#### PART 5: Telegram Bot Integration
- Created `/src/lib/telegram-bot.ts` with:
  - `generateTelegramBotSetup()` instructions
  - `generateWebhookUrl(botToken)` helper
  - `buildLeadNotificationMessage()` for formatting lead notifications
- Created `/src/app/api/telegram-notify/route.ts`:
  - POST endpoint accepting { botToken, chatId, message }
  - Sends formatted message to Telegram Bot API with HTML parse mode
  - Returns success/error with proper status codes
- Added to page.tsx:
  - Settings gear icon in header
  - Dialog for Telegram Bot Settings (bot token, chat ID, notification toggles, test button, setup instructions)
  - Auto-send Telegram notifications when search finds leads (respects HOT-only setting)
  - Settings persisted to localStorage

#### Build Verification
- `npm run lint` passes with zero errors
- `npx next build` compiles successfully with all routes:
  - `/` (static)
  - `/api/telegram-notify` (dynamic, new)
  - All existing API routes unchanged

---
## Task ID: 2
### Agent: API audit agent
### Task: Audit and fix JSON parsing bugs + verify geo data accuracy

### Work Log:

#### 1. Fixed critical JSON parse bug in `/src/app/api/telegram-notify/route.ts`
- **Bug**: `await resp.json()` was called on line 27 **before** `resp.ok` was checked on line 29. If Telegram API returned an HTML error page (502, 504, rate limit), the `.json()` call would throw `Unexpected token '<'` — an uncaught error that bypassed the `!resp.ok` error handling entirely.
- **Fix**: Restructured to check `resp.ok` first, then validate `content-type` includes `json` before calling `.json()`. Added try/catch around `.json()` parse. Error response body is now safely extracted with appropriate fallback for non-JSON responses.

#### 2. Ukrainian error messages in `/src/app/api/analyze/route.ts`
- Changed generic English `"Analysis failed"` to Ukrainian `"Помилка аналізу вебсайту"` with Error message passthrough.

#### 3. Ukrainian error messages in `/src/app/api/export/route.ts`
- Changed `"No leads data provided"` → `"Не надано дані лідів для експорту"`
- Changed generic `"Export failed"` → `"Помилка експорту файлу"` with Error message passthrough.

#### 4. Improved geo data accuracy in `/src/lib/osm-search.ts`
- **Photon geocoder** (`geocodePhoton`): Changed from `limit=1` to `limit=5`. Added settlement-type filtering — now scans results for `osm_value` matching city/town/village/hamlet/suburb etc. before falling back to the first result. This prevents a POI or street named like a city (e.g., searching "Bar" would return the city in Montenegro, not a bar).
- **Nominatim geocoder** (`geocodeNominatim`): Changed from `limit=1` to `limit=5`. Added settlement-type filtering by `type` and `class` fields, also checking `importance > 0.5` for administrative boundaries. Falls back to first result if no settlement found.

#### 5. Verification of existing code
- `osm-search.ts`: Overpass API `executeQuery()` already has proper content-type validation and error handling (fixed in Task 1). ✅
- `website-analyzer.ts`: Uses `resp.text()` for HTML content (correct — no JSON parsing needed). ✅
- `scoring.ts`, `storage.ts`, `outreach-templates.ts`, `telegram-bot.ts`: No external fetch calls. ✅
- `search/route.ts`: Already has proper Ukrainian error handling. ✅

### Build Verification
- `npx next build` — compiles successfully, all 8 routes pass (1 static, 7 dynamic).

---
## Task ID: 3
### Agent: Main agent
### Task: Fix nested button hydration error in page.tsx

### Work Log:
- Fixed hydration error: `<button>` cannot be a descendant of `<button>`
- Changed outer `<button>` at line 717 (lead card header expand toggle) to `<div role="button">` with tabIndex, onKeyDown, and cursor-pointer
- Changed outer `<button>` at line 589 (search history toggle) to `<div role="button">` with same accessibility attributes
- Fixed orphaned `</button>` closing tag at line 600 to `</div>`
- The inner buttons (favorite star, clear history, delete history item) remain as proper `<button>` elements
- Build verification: `npx next build` passes successfully

### Stage Summary:
- Hydration error fixed by replacing outer `<button>` wrappers with accessible `<div>` elements
- All 3 button nesting issues resolved
- No other nested button issues found in the expanded content or dialogs

---
## Task ID: 4
### Agent: Main agent
### Task: Fix geo data accuracy — searching for Dnipro (Ukraine) returned Belarus results

### Work Log:
- **Root cause**: When user types "Днепр" (Russian spelling), Photon geocoder returns a hamlet in Belarus as first result. The actual city of Dnipro doesn't appear in Photon results for Russian spelling.
- **Root cause 2**: When user types "Дніпро" (Ukrainian), Photon correctly returns the city, but Nominatim returns the river first (waterway class), city only 4th.

### Fixes applied to `/src/lib/osm-search.ts`:

1. **Photon geocoder** — Complete rewrite with scoring system:
   - Requests 10 results (was 5) for better filtering
   - Added excluded types list: rivers, waterways, streams, stations, railways, industrial, garages, hotels etc.
   - Added type priority scoring: city=10, town=8, municipality=7, village=5, hamlet=3
   - Cyrillic detection: `+20` bonus for UA countrycode, `+5` for BY/RU
   - Added bonus for Ukrainian oblast names (Дніпропетровська, Київська, Львівська, etc.)
   - Builds display name with state + country context

2. **Nominatim geocoder** — Improved with country filtering:
   - For Cyrillic queries: adds `countrycodes=ua` parameter (only Ukrainian results)
   - Sets `accept-language=uk,en` for Cyrillic queries
   - Requests 10 results (was 5)
   - Added excluded classes: waterway, railway, highway, natural
   - Added excluded types: river, stream, lake, canal, station, bus_stop
   - Added scoring by type + importance + class=place bonus
   - Sorts by score descending, picks best valid result

3. **Cross-validation** for Cyrillic queries:
   - If Photon returns a result for a Cyrillic query, also queries Nominatim with `countrycodes=ua`
   - If Nominatim returns a result with "Україн" or "Ukraine" in displayName, prefers it over Photon
   - This handles the case where Photon returns Belarus for "Днепр" but Nominatim correctly finds Dnipro, Ukraine

4. **Fallback strategy**: If no result found, retries with "місто" (Ukrainian for "city") appended to the query

### Changes to `/src/app/api/search/route.ts`:
- Added geocodeCity() call to resolve city coordinates before searching
- Returns `geoLocation` object (lat, lng, displayName) in API response

### Changes to `/src/app/page.tsx`:
- Added `geoLocations` state to track resolved coordinates per city
- Added "Знайдені локації" UI section with clickable OpenStreetMap links showing resolved city, coordinates, and country
- Updated placeholder to show Ukrainian cities first: "Дніпро, Kyiv, Львів, London..."

### Verification:
- "Дніпро" (Ukrainian) → Photon: city Dnipro, UA ✅
- "Днепр" (Russian) → Photon returns Belarus, but Nominatim cross-validation overrides with Dnipro, UA ✅
- "Днепр, місто" fallback → also works via Nominatim ✅
- Build passes: `npx next build` compiles successfully

---
## Task ID: 5-a
### Agent: Backend agent
### Task: Fix Overpass 502, smart query parser, caching

### Work Log:

#### 1. Added more Overpass API fallback endpoints (`/src/lib/osm-search.ts`)
- Expanded `OVERPASS_ENDPOINTS` from 2 to 5 endpoints:
  - `https://overpass.kumi.systems/api/interpreter` (existing)
  - `https://overpass-api.de/api/interpreter` (existing)
  - `https://maps.mail.ru/osm/tools/overpass/api/interpreter` (NEW — Mail.ru mirror)
  - `https://overpass.openstreetmap.ru/api/interpreter` (NEW — Russian mirror)
  - `https://overpass.tru.vn.ua/api/interpreter` (NEW — Ukrainian mirror)
- The existing fallback chain, content-type validation, and retry logic now tries all 5 endpoints before giving up, dramatically reducing 502 Bad Gateway failures.

#### 2. Created Smart Query Parser (`/src/lib/query-parser.ts`)
- New file with exported `parseQuery(input: string)` → `{ city, query, language }` function and `ParsedQuery` type
- Handles all required input formats:
  - "dentists in Berlin" → city:"Berlin", query:"dentists", lang:"en"
  - "стоматології Київ" → city:"Київ", query:"стоматології", lang:"ua"
  - "Kyiv restaurants" → city:"Kyiv", query:"restaurants", lang:"en"
  - "ресторани у Львові" → city:"Львів", query:"ресторани", lang:"ua"
  - "юрист Дніпро" → city:"Дніпро", query:"юрист", lang:"ua"
  - "cafe London" → city:"London", query:"cafe", lang:"en"
  - "Dnipro, Ukraine lawyer" → city:"Dnipro, Ukraine", query:"lawyer", lang:"en"
  - "Berlin" → city:"Berlin", query:"", lang:"en" (city-only)
  - "юрист" → city:"", query:"юрист", lang:"ua" (niche-only)
- Parsing strategies applied in order:
  1. Split by Ukrainian prepositions (у, в, біля, поблизу)
  2. Split by English prepositions (in, within, near, at)
  3. Split by comma
  4. Split by spaces with known-city lookup (built-in list of ~40 major cities)
  5. Capitalization heuristic (lowercase first word = niche, capitalized = city)
  6. Single-word: known city → city-only, otherwise → niche-only
- Language detection: counts Cyrillic vs Latin characters; Cyrillic with і/ї/є/ґ or Ukrainian words → "ua", otherwise "ru"; Latin → "en"

#### 3. Added in-memory result caching (`/src/lib/osm-search.ts`)
- Added `OverpassCacheEntry` interface with `elements[]` and `timestamp`
- Cache parameters: TTL = 10 minutes (600,000ms), max 100 entries
- LRU-like eviction: on access, entries are moved to the end of the Map; when full, the oldest entry (first key) is evicted
- `getCachedOverpass(query)` checks TTL, returns elements or null
- `setCachedOverpass(query, elements)` enforces max size, stores with timestamp
- Integrated into `executeQuery()`: cache checked first (logs hit), empty results also cached, successful results cached before returning

### Build Verification:
- `npx next build` — compiles successfully, all routes pass (1 static, 7 dynamic).

### Stage Summary:
- Overpass fallback expanded from 2 → 5 endpoints, reducing 502 failures
- Smart query parser created with multi-language support (EN/UA/RU) and 6 parsing strategies
- In-memory LRU cache added for Overpass results (10min TTL, 100 max entries)
- All changes compile cleanly with no build errors

---
## Task ID: 5-b
### Agent: Scoring & i18n agent
### Task: Smarter scoring, opportunity calculation, i18n system

### Work Log:

#### 1. Enhanced Scoring System (`/src/lib/scoring.ts`)

Added new types and function for transparent multi-factor lead scoring:

**New interfaces:**
- `ScoreFactor` — individual scoring factor with name, icon, points, and severity (critical/warning/info)
- `ScoreBreakdown` — complete scoring result with score (0-100), rating (HOT/WARM/COLD/NEW), factors array, estimated value range, and Ukrainian opportunity text

**New function `calculateLeadScoreDetailed(lead)`:**
Multi-factor scoring formula (higher = worse site = better prospect):
- No website at all: +60 pts (critical)
- Copyright year ≤ 2016: +25 pts (critical)
- Copyright year 2017-2019: +15 pts (warning)
- No mobile viewport: +20 pts (critical)
- No SSL certificate: +15 pts (critical)
- Old technology (Joomla/Drupal/uCoz/Bitrix/MODX/WordPress): +20 pts (critical)
- No contact form: +10 pts (warning)
- Table-based layout: +10 pts (warning)
- No SEO meta tags: +5 pts (info)
- No social links: +5 pts (info)
- Many inline styles: +5 pts (info)

Rating thresholds: 60+ = HOT 🔥, 30-59 = WARM ⚡, 10-29 = COLD ❄️, 0-9 = NEW ✅

**Value estimation tiers:**
- Score ≥ 80: $800-$2000 (full redesign)
- Score ≥ 60: $500-$1500
- Score ≥ 45: $300-$800
- Score ≥ 30: $200-$500
- Score ≥ 15: $100-$300
- Score ≥ 10: $50-$200
- Score < 10: $0-$100

**Ukrainian opportunity text generation:**
- Generates contextual text per rating tier explaining the opportunity, estimated price, and contact priority

**New helper `getDetailedScoreColor(rating)`:**
- Returns Tailwind color classes for the extended 4-tier rating (HOT/WARM/COLD/NEW)

**All existing functions preserved:** `scoreLead()`, `getScoreColor()`, `getDesignColor()`, `getStatusColor()`, `getStatusList()` — fully backward compatible.

#### 2. i18n System (`/src/lib/i18n.ts`)

Created comprehensive translation system with 90+ translation keys covering all UI text from page.tsx:

**Type `Locale`:** `"ua" | "en" | "ru"`

**Interface `Translations`:** Complete type-safe translations covering:
- Header (appTitle, appSubtitle)
- Search form (city/niche/count/radius labels & placeholders, search button states)
- Filters (all, favorites, issues, statuses)
- Score labels (hot, warm, cold, new)
- Dashboard stats (total leads, old sites, not mobile, no SSL, no website, avg estimate)
- Lead details (desktop, mobile, open site, problems, analysis, technologies, price, contacts)
- Outreach section (write to owner, copy email, open Telegram, template, preview, hide)
- Lead management (status, contact date, notes)
- Statuses (new, contacted, interested, not interested, deal, lost)
- Design scores (ancient, outdated, modern, unknown)
- Telegram settings dialog (all labels and setup instructions)
- Toast messages, footer, empty states, misc UI text

**Full translations provided:**
- 🇺🇦 Ukrainian (default) — 90+ keys
- 🇬🇧 English — 90+ keys
- 🇷🇺 Russian — 90+ keys

**Exported functions:**
- `getTranslations(locale)` — returns Translations object, defaults to "ua"
- `detectLocale(text)` — heuristic locale detection (Cyrillic chars → UA/RU, Latin → EN)
- `AVAILABLE_LOCALES` — array of { value, label, flag } for locale selector UI

### Build Verification:
- `npx next build` — compiles successfully, all routes pass (1 static, 7 dynamic)
- Zero TypeScript errors in new files (scoring.ts, i18n.ts)

### Stage Summary:
- Multi-factor scoring system with transparent breakdown (11 factors, 4 severity levels)
- Ukrainian opportunity text auto-generation per score tier
- Value estimation with 7 price tiers mapped to score ranges
- Complete i18n system with 90+ keys in 3 languages (UA/EN/RU)
- Full backward compatibility — all existing scoring functions unchanged

---
## Task ID: 5-c
### Agent: UI agent
### Task: UI overhaul — integrate all new features into page.tsx

### Work Log:

#### 1. Added new imports to `/src/app/page.tsx`
- `getTranslations, AVAILABLE_LOCALES, type Locale` from `@/lib/i18n`
- `parseQuery, type ParsedQuery` from `@/lib/query-parser`
- `calculateLeadScoreDetailed, getDetailedScoreColor, type ScoreBreakdown` from `@/lib/scoring`
- Removed duplicate scoring import, consolidated into single import block

#### 2. Fixed i18n translations in `/src/lib/i18n.ts`
- Added `websitesOnly` translation for all 3 languages (UA: "🌐 З сайтом", EN: "🌐 With website", RU: "🌐 С сайтом")

#### 3. New state variables added to page.tsx
- `locale` — persisted to localStorage via `leadfinder_locale` key, defaults to "ua" (SSR-safe with typeof window check)
- `smartQuery` / `parsedQuery` — for natural language query input
- `onlyWithWebsite` — new filter toggle
- `visibleCount` — pagination state, defaults to 20

#### 4. Locale persistence + translation object
- `useEffect` saves locale to localStorage on change
- `const t = getTranslations(locale)` provides translations for all 3 languages
- `useEffect` resets `visibleCount` to 20 when filters or leads change

#### 5. Language Switcher (Feature 1 — i18n)
- Added flag buttons (🇺🇦/🇬🇧/🇷🇺) in the header, next to Settings button
- Active locale highlighted with ring/border styling
- Clicking a flag switches language immediately

#### 6. Smart Query Input (Feature 2 — Query Parser + Feature 6)
- Added natural language input field ABOVE the advanced search grid
- Uses `t.nichePlaceholder` for the input placeholder
- On Enter: calls `handleSmartQuery()` which:
  - Parses input with `parseQuery()`
  - Auto-fills city and niche fields from parsed result
  - Shows detected components as badges (city, niche, language flag)
  - Auto-switches UI locale based on detected language
  - If both city and query are present, triggers search automatically
- Clear button (X) to reset the smart query

#### 7. "Websites Only" Filter Toggle (Feature 3)
- Added `onlyWithWebsite` state and Switch in the filter bar
- Added `.filter((l) => !onlyWithWebsite || (l.website && l.website !== "N/A"))` to filteredLeads

#### 8. Full i18n text replacement (Feature 1 continuation)
- Replaced 70+ hardcoded Ukrainian strings in JSX with `t.xxx` translation keys
- Header: appTitle, appSubtitle, settings tooltip, CSV/Excel labels
- Search form: cityLabel, cityPlaceholder, nicheLabel, nichePlaceholder, countLabel, radiusLabel, quickKeywords, searchButton/searching/analyzing states
- Search history: title, clearAll, delete, results/km units
- Summary dashboard: totalLeads, hot, veryOldSites, notMobile, noSsl, noWebsite, avgEstimate, filteredLeads, readyToContact
- Filters: allFilter, hot/warm/cold labels, allStatuses, onlyFavorites, onlyWithIssues, websitesOnly
- Lead cards: removeFromFavorites, addToFavorites, desktop, mobile, openSite, noSiteBestProspect, problems, detailedAnalysis, technologies, formBadge, priceEstimate, contacts, phone, email, address, website, noSiteTopProspect
- Outreach: writeToOwner, copyEmail, openTelegram, template, preview/hide, theme
- Lead management: leadManagement, status, contactDate, notes, notesPlaceholder
- Empty states: emptyTitle, emptyDescription, noResults, noFiltersResults
- Footer: footer
- Telegram dialog: telegramSettings, telegramSettingsDesc, notifyNewLeads, notifyNewLeadsDesc, hotLeadsOnly, hotLeadsOnlyDesc, test, save, settingsSaved, howToSetupBot, botSetupStep1-5, notAvailable
- Fixed `t` variable collision: renamed `templates.map((t) =>` to `templates.map((tmpl) =>)` to avoid shadowing the translations `t`
- Updated template tone display to use `t.formal/t.friendly/t.direct` instead of Ukrainian abbreviations

#### 9. Scoring Breakdown "Why HOT" (Feature 4)
- Added inline IIFE in each expanded lead card after price estimation
- Uses `calculateLeadScoreDetailed(lead)` to get full breakdown
- Shows:
  - Section header with `t.whyHot` — `t.scoringBreakdown`
  - Colored progress bar (0-100) with rating-specific color (red/yellow/green/emerald)
  - Rating badge with emoji and score
  - Each ScoreFactor listed with icon, name, points, and severity color:
    - critical → red background
    - warning → amber background
    - info → blue background
  - Opportunity text at the bottom

#### 10. "Load More" Pagination (Feature 5)
- Changed `filteredLeads.map(...)` to `filteredLeads.slice(0, visibleCount).map(...)`
- Added conditional "Load More" button after lead cards grid when `visibleCount < filteredLeads.length`
- Button shows count of remaining leads: `t.loadMore (N)`
- Clicking adds 20 more leads to visibleCount
- visibleCount resets to 20 when any filter or leads change (via useEffect)

#### 11. Build Verification
- `npx next build` — compiles successfully
- All 8 routes pass (1 static, 7 dynamic)
- File grew from ~1250 lines to ~1411 lines
- All existing features preserved: history, favorites, Telegram, export, templates, settings

### Stage Summary:
- Full i18n integration with 3 languages (UA/EN/RU) and language switcher
- Smart query input with natural language parsing and auto-fill
- "Websites Only" filter toggle
- Detailed scoring breakdown ("Why HOT") in expanded lead cards
- "Load More" pagination (20 per page)
- 70+ hardcoded Ukrainian strings replaced with translation keys

---
## Task ID: 2
### Agent: Main agent
### Task: Fix 502 Bad Gateway error in Overpass API + add retry with exponential backoff

### Work Log:

#### 1. Added retry with exponential backoff to `executeQuery()` in `/src/lib/osm-search.ts`
- **Problem**: The old `executeQuery()` tried 5 Overpass endpoints but failed fast on each one without retrying. When an endpoint returned 502/503/504, it immediately moved to the next endpoint — wasting the opportunity that a simple retry (the error is often transient) would succeed.
- **Solution**: Wrapped each endpoint attempt in an inner retry loop (`for` loop with `MAX_RETRIES_PER_ENDPOINT = 3`):
  - **Retryable status codes**: 429 (rate limit), 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout)
  - **Exponential backoff delays**: 1s, 2s, 4s (`RETRY_DELAYS_MS = [1000, 2000, 4000]`)
  - **Retry-After header support**: For 429 responses, reads `Retry-After` header and uses it (capped at 10s) instead of the default delay
  - **Non-JSON server error retry**: When response content-type is not JSON and the HTML body contains "502", "Bad Gateway", "503", "Service Unavailable", "504", or "Gateway Timeout", retries with backoff
  - **JSON parse error retry**: When `.json()` throws (e.g., truncated response), retries with backoff
  - **Network error retry**: When `fetch()` itself throws (DNS failure, connection reset), retries with backoff
  - **Non-retryable errors** (400, 403, 404, etc.): Immediately break to next endpoint (same as before)
  - **Total attempts per endpoint**: 4 (1 initial + 3 retries)
  - **Total attempts across all 5 endpoints**: Up to 20

#### 2. Added random delay between endpoint attempts
- Added `randomDelay(500, 1500)` (0.5-1.5s) before each request after the first endpoint to avoid hitting rate limits on multiple rapid searches
- Uses `sleep()` helper function for the delay

#### 3. Fixed Overpass QL query timeout
- Changed `[timeout:30]` → `[timeout:25]` in both `buildTagQuery()` and `buildBroadQuery()`
- Reduces the server-side query timeout, giving Overpass more headroom and reducing timeout-related 502 errors

#### 4. Improved error message when all endpoints fail
- Old: `Усі сервери Overpass недоступні. Спробуйте пізніше.`
- New: Comprehensive Ukrainian message with:
  - Number of endpoints attempted and retries per endpoint
  - Last error from Overpass
  - 💡 Tips: try again in a minute, reduce search radius, note that Overpass is a free service

#### 5. Cache verification
- Confirmed `getCachedOverpass()` is checked first in `executeQuery()` — returns immediately without hitting any Overpass endpoint
- Empty results (`[]`) are also cached to avoid repeat lookups
- Successful results are cached before returning

#### 6. Content-type validation preserved
- Response content-type is checked for "json" before calling `.json()`
- Added try/catch around `.json()` call with retry on parse failure

### Build Verification:
- `npm run lint` — zero errors
- Dev server compiles successfully (`✓ Compiled in 62ms`)
- Public API unchanged: `searchOverpass()` and `geocodeCity()` signatures preserved
- All 5 OVERPASS_ENDPOINTS preserved with same fallback chain logic

### Stage Summary:
- Retry with exponential backoff (1s/2s/4s) added for 502/503/504/429 errors, non-JSON server errors, JSON parse errors, and network errors
- Up to 3 retries per endpoint × 5 endpoints = 20 total attempts (was 5)
- Retry-After header respected for 429 rate limit responses (capped at 10s)
- Random 0.5-1.5s jitter between endpoint switches to avoid rate limiting
- Overpass QL timeout reduced from 30s to 25s
- Helpful error message with troubleshooting tips when all retries exhausted
- All existing functionality preserved (caching, fallback chain, content-type checks)

---
## Task ID: 2b
### Agent: Bug fix agent
### Task: Fix missing i18n keys and audit for bugs across the codebase

### Work Log:

#### 1. Fixed missing i18n keys in `/src/lib/i18n.ts`

**Problem**: The `Translations` interface was missing two keys that were used in `page.tsx` with inline fallback strings, indicating they were forgotten during the initial i18n integration.

**Added keys:**
- `advanced` — used on line 657 of page.tsx as a section separator label ("— Advanced —")
  - ua: "Розширений"
  - en: "Advanced"
  - ru: "Расширенный"
- `foundLocations` — used on line 759 of page.tsx as a heading for resolved geo locations
  - ua: "Знайдені локації"
  - en: "Found locations"
  - ru: "Найденные локации"

**Changes:**
- Added `advanced: string` and `foundLocations: string` to the `Translations` interface
- Added translations for both keys in all 3 locale objects (ua, en, ru)

#### 2. Removed fallback patterns from `/src/app/page.tsx`

- Line 657: Changed `{t.advanced || 'Advanced'}` → `{t.advanced}` (fallback no longer needed)
- Line 759: Changed `{t.foundLocations || 'Found locations'}` → `{t.foundLocations}` (fallback no longer needed)

#### 3. Comprehensive i18n key audit

Searched all `t.xxx` usages in page.tsx and cross-referenced against the Translations interface. After filtering out JavaScript/React built-in methods (t.map, t.slice, t.trim, t.toLowerCase, t.toFixed, t.createElement, t.MouseEvent, t.ReactNode, t.add, t.body, t.csv, t.has, t.id, t.me, t.replace, t.xlsx, t.value), verified all remaining keys exist in the interface. No other missing keys found.

#### 4. Audited search API route (`/src/app/api/search/route.ts`)

- ✅ `maxDuration = 60` confirmed set
- ✅ All error responses return JSON via `NextResponse.json()`
- ✅ Input sanitization: `String().trim()` for city/query, `parseInt()` with bounds clamping for maxResults (1-200) and radius (1-100)
- **Fixed**: Reordered validation to trim first, then check for empty strings. Previously, whitespace-only values (e.g., city: "   ") would pass the `!city` check and proceed to search with an empty trimmed city string. Now validation runs after trimming with `String(city || "").trim()`.

#### 5. Audited analyze API route (`/src/app/api/analyze/route.ts`)

- ✅ `maxDuration = 30` confirmed set
- ✅ Proper timeout handling: `website-analyzer.ts` uses `AbortSignal.timeout(TIMEOUT)` with 10-second timeout, plus HTTP fallback with its own timeout
- ✅ Non-HTML content types handled: checks `contentType.includes("text/html")` and returns empty result for non-HTML
- ✅ URL protocol normalization: adds `https://` prefix if missing
- ✅ All error responses return JSON
- ✅ Handles `!url || url === "N/A"` with a valid empty response (skipped: true)
- No issues found.

### Build Verification:
- `npm run lint` — zero errors
- `npx next build` — compiles successfully, all 10 routes pass (1 static, 9 dynamic)

### Stage Summary:
- Added 2 missing i18n keys (`advanced`, `foundLocations`) with translations in all 3 languages
- Removed 2 inline fallback patterns from page.tsx
- Fixed input validation order in search API route (trim before check)
- Full audit of search and analyze API routes — no other issues found

---
## Task ID: 3
### Agent: Backend agent
### Task: Add mass PageSpeed Insights checking functionality

### Work Log:

#### 1. Created `/src/app/api/pagespeed/route.ts` (NEW)

POST endpoint for checking website performance via Google PageSpeed Insights API v5.

**Request body:**
- `url: string` — the website URL to check (required)
- `strategy?: "mobile" | "desktop"` — device strategy, defaults to "mobile"

**Response format (simplified):**
```json
{
  "url": "https://example.com",
  "strategy": "mobile",
  "performanceScore": 85,
  "firstContentfulPaint": 1200,
  "largestContentfulPaint": 2500,
  "totalBlockingTime": 150,
  "cumulativeLayoutShift": 0.05,
  "speedIndex": 2000,
  "diagnostics": ["Render-blocking resources: 3 resources", "..."]
}
```

**Key implementation details:**
- `export const maxDuration = 30` set for Vercel compatibility
- Uses `AbortController` with 28s timeout (within 30s maxDuration)
- Calls `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` with `category=performance`
- URL validation: normalizes missing protocols, catches invalid URLs
- Strategy validation: only "mobile" or "desktop" accepted
- Content-type validation before JSON parsing (same pattern as other API routes)
- Comprehensive error handling for:
  - 429 rate limit → Ukrainian message to retry later
  - 400 bad request → URL validation error
  - Timeout (AbortError) → 504 with retry message
  - Missing `lighthouseResult` → "Lighthouse couldn't reliably load page"
  - API-level errors in response body → forwarded with partial data
  - Non-JSON responses → graceful error with null metrics
- Error responses always include partial data with null metrics + `error` field
- Extracts up to 5 diagnostic suggestions from Lighthouse audits (only those scoring < 0.9)
- Performance score converted from 0-1 scale to 0-100

#### 2. Created `/src/lib/pagespeed.ts` (NEW)

Client-side utility library with type-safe helpers:

**Types:**
- `PageSpeedResult` interface — matches the API response shape with all optional null fields

**Core function:**
- `checkPageSpeed(url, strategy?)` — Calls `/api/pagespeed` endpoint with proper error handling. Falls back gracefully if response is non-JSON.

**Formatting helpers:**
- `getScoreColor(score)` → Tailwind text color class (red < 50, orange < 90, green ≥ 90)
- `getScoreBgColor(score)` → Tailwind background color class
- `getScoreBorderColor(score)` → Tailwind border color class
- `getScoreRating(score)` → Ukrainian rating label ("Погано" / "Потребує покращення" / "Добре" / "Н/Д")

**Metric formatters:**
- `formatMs(ms)` → "150ms" or "1.5s" (auto-detects unit)
- `formatCls(cls)` → "0.050" (3 decimal places)

**Core Web Vitals evaluation (Google thresholds):**
- `getMetricRating(metric, value)` → `{ rating, label }` with Google's good/needs-improvement/poor thresholds:
  - FCP: good ≤ 1.8s, poor > 3.0s
  - LCP: good ≤ 2.5s, poor > 4.0s
  - TBT: good ≤ 200ms, poor > 600ms
  - CLS: good ≤ 0.1, poor > 0.25
  - SI: good ≤ 3.4s, poor > 5.8s
- `getMetricDotColor(rating)` → Tailwind bg color for CWV dot indicators

### Build Verification:
- `npm run lint` — zero errors
- Dev server compiles successfully with new files
- No changes to `page.tsx` (UI integration is a separate task)
- All existing routes unaffected

### Stage Summary:
- PageSpeed Insights API endpoint created at `/api/pagespeed` with 28s timeout and comprehensive error handling
- Client-side utility library with 9 exported functions for score formatting, metric display, and CWV evaluation
- Ukrainian error messages throughout for consistency with existing API routes
- Designed for one-at-a-time URL checking (API takes 10-30s per request)
- Ready for UI integration in a subsequent task
