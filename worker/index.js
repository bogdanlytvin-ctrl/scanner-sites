import nextWorker from "../.open-next/worker.js";
import { DurableObject } from "cloudflare:workers";
import { Workspace, workspaceRequest } from "./workspace.js";
import { renderReport, REPORT_HEADERS } from "./report.js";
import { geocodeCity, discoverBusinessesAt } from "../src/lib/osm-search.ts";
import { assessLead, domainExpiry } from "../src/lib/lead-assessment.ts";

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

// Offer letter drafted by Claude on the VPS (/home/claude/writer, no tools). null -> the workspace uses a template.
async function writeOffer(env, lead) {
  const response = await fetch(env.PROBE_URL.replace(/\/$/, "") + "/write", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.PROBE_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ lead }),
    signal: AbortSignal.timeout(150_000),
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
          domainInfo: domainExpiry,
        }),
      writeOffer: env.PROBE_URL && env.PROBE_TOKEN ? (lead) => writeOffer(env, lead) : undefined,
      discoverBusinessesAt: (...args) =>
        discoverBusinessesAt(...args, (path) =>
          env.ASSETS.fetch(
            new Request(
              new URL(path, "https://scanner-sites.b-litvin2023.workers.dev"),
            ),
          ),
        ),
      // Client reports live in the shared "admission" object so a public link can find them.
      reportStore: async (path, payload) => {
        const result = await env.WORKSPACES.getByName("admission").fetch("https://internal" + path, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return result.ok;
      },
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
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/workspace") {
      return workspaceRequest(request, env.WORKSPACES);
    }
    const report = pathname.match(/^\/r\/([a-f0-9]{32})$/);
    if (report) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      const found = await env.WORKSPACES.getByName("admission").fetch("https://internal/report-get", { method: "POST", body: report[1] });
      if (!found.ok)
        return new Response("<!doctype html><meta charset=utf-8><title>Звіт не знайдено</title><p style=\"font:16px system-ui;padding:24px\">Звіт не знайдено або строк його дії минув.</p>",
          { status: 404, headers: REPORT_HEADERS });
      return new Response(renderReport(await found.json()), { headers: REPORT_HEADERS });
    }
    return nextWorker.fetch(request, env, ctx);
  },
};
