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
