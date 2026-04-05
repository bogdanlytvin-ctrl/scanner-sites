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
