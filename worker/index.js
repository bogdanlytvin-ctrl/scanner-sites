import nextWorker from "../.open-next/worker.js";
import { DurableObject } from "cloudflare:workers";
import { Workspace, workspaceRequest } from "./workspace.js";
import { geocodeCity, discoverBusinessesAt } from "../src/lib/osm-search.ts";
import { assessLead } from "../src/lib/lead-assessment.ts";

export * from "../.open-next/worker.js";

// Real Chromium + Lighthouse on the VPS (/opt/ScannerProbe). Checks queue there one by one, so allow a long wait.
async function probeSite(env, url) {
  const response = await fetch(env.PROBE_URL.replace(/\/$/, "") + "/probe", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.PROBE_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(180_000),
  });
  return response.ok ? response.json() : null;
}

export class LeadWorkspace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.workspace = new Workspace(ctx.storage, {
      geocodeCity,
      assessLead: (business, service) =>
        assessLead(business, service, {
          pageSpeedKey: env.GOOGLE_PAGESPEED_API_KEY,
          probe: env.PROBE_URL && env.PROBE_TOKEN ? (url) => probeSite(env, url) : undefined,
        }),
      discoverBusinessesAt: (...args) =>
        discoverBusinessesAt(...args, (path) =>
          env.ASSETS.fetch(
            new Request(
              new URL(path, "https://scanner-sites.b-litvin2023.workers.dev"),
            ),
          ),
        ),
      reserve: async () => {
        const result = await env.WORKSPACES.getByName("admission").fetch(
          "https://internal/budget",
          { method: "POST" },
        );
        return result.ok;
      },
    });
  }

  fetch(request) {
    return this.workspace.fetch(request);
  }
  alarm() {
    return this.workspace.alarm();
  }
}

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/api/workspace") {
      return workspaceRequest(request, env.WORKSPACES);
    }
    return nextWorker.fetch(request, env, ctx);
  },
};
