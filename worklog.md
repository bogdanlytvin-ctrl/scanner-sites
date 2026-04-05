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
