import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Serve prerendered pages (`/`, `/_not-found`) from the ASSETS binding.
// Without this the default "dummy" cache misses on every request, so OpenNext
// re-renders the heavy homepage via SSR each time and blows the Worker CPU /
// startup limit → the page intermittently times out / 503s while the cheap
// /api/* routes stay fast. This cache is read-only (no revalidation), which is
// exactly right: the homepage is fully static and all dynamism lives in
// client components + /api routes.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
