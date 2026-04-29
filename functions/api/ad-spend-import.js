/**
 * POST /api/ad-spend-import?platform=google-ads
 *
 * Imports daily per-platform per-campaign ad spend from a CSV body. Used
 * by the weekly Cowork session import workflow - Jon exports a fresh CSV
 * from the Google Ads dashboard, drops it in
 * `/sales & marketing/reporting/exports/google-ads/`, and a Cowork
 * session POSTs the body here.
 *
 * Why CSV over the platform's REST API: zero developer-token approval lead
 * time, no OAuth flow to maintain, robust to platform UI changes. Aligned
 * with the weekly sales meeting cadence so freshness is fine. The full
 * CSV-vs-API trade-off lives in PROJECT.md session 56 entry.
 *
 * Query params:
 *   platform - 'google-ads' (today). Maps onto the platform bucket label
 *              used in /api/attribution-stats ('Google Ads' etc).
 *
 * Body: raw CSV text. Format-specific parser based on the platform.
 *
 * Idempotent via the UNIQUE(date, platform, campaign, source) constraint
 * on ad_spend - re-importing the same CSV upserts in place.
 *
 * Read this in tandem with /functions/api/attribution-stats.js which joins
 * the ad_spend rows back to the per-platform funnel for CPA/ROAS surfacing.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* Map a platform query param to the bucket label used in
   /api/attribution-stats so the join in the dashboard lines up. */
const PLATFORM_LABEL = {
  "google-ads": "Google Ads",
  "meta": "Meta Ads",
  "microsoft-ads": "Microsoft Ads",
  "tiktok": "TikTok Ads",
  "linkedin": "LinkedIn Ads",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/* RFC 4180-ish CSV row parser. Handles quoted fields with embedded
   commas (Google Ads exports impressions as "2,379"). Does NOT handle
   embedded newlines inside quoted fields - none of the platform exports
   we ingest produce those. */
function parseCsvRow(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* Strip quotes + thousands commas from a numeric field. Returns null
   if the cleaned string is empty or non-numeric. */
function parseNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[",]/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* Google Ads CSV shape:
     Row 1: "Untitled report" or report name (boilerplate)
     Row 2: Date range header (boilerplate)
     Row 3: Column header row - Campaign, Day, Currency code, Cost, Impr.,
            Clicks, Conversions, Cost / conv., TrueView view rate
     Row 4+: Data rows. Numbers may be quoted with thousands commas.

   We tolerate slight column reordering by name-mapping the header row.
   Required columns: Campaign, Day, Cost. Optional: Impressions, Clicks,
   Conversions, Currency. */
function parseGoogleAdsCsv(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.length > 0);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (/^"?Campaign"?\s*,\s*"?Day"?/i.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    throw new Error("Could not find Google Ads CSV header row (expected 'Campaign,Day,...')");
  }
  const header = parseCsvRow(lines[headerIdx]).map(h => h.trim().toLowerCase());
  const idx = (name) => header.findIndex(h => h === name.toLowerCase());
  const colCampaign = idx("campaign");
  const colDay = idx("day");
  const colCost = idx("cost");
  const colImpr = idx("impr.") !== -1 ? idx("impr.") : idx("impressions");
  const colClicks = idx("clicks");
  const colConv = idx("conversions");
  const colCurrency = idx("currency code") !== -1 ? idx("currency code") : idx("currency");
  if (colCampaign < 0 || colDay < 0 || colCost < 0) {
    throw new Error(`Google Ads CSV missing required columns. Found: ${header.join(", ")}`);
  }

  const rows = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const campaign = (cells[colCampaign] || "").trim();
    const day = (cells[colDay] || "").trim();
    const cost = parseNumber(cells[colCost]);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || cost == null) { skipped++; continue; }
    rows.push({
      date: day,
      campaign: campaign || null,
      spend_pence: Math.round(cost * 100),
      impressions: colImpr >= 0 ? (parseNumber(cells[colImpr]) || 0) : 0,
      clicks: colClicks >= 0 ? (parseNumber(cells[colClicks]) || 0) : 0,
      conversions: colConv >= 0 ? (parseNumber(cells[colConv]) || 0) : 0,
      currency: colCurrency >= 0 ? ((cells[colCurrency] || "GBP").trim() || "GBP") : "GBP",
    });
  }
  return { rows, skipped };
}

const PARSERS = {
  "google-ads": parseGoogleAdsCsv,
};

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.DB) return jsonResponse({ ok: false, error: "no_db" }, 500);

  const url = new URL(request.url);
  const platformKey = (url.searchParams.get("platform") || "").toLowerCase();
  const platformLabel = PLATFORM_LABEL[platformKey];
  const parser = PARSERS[platformKey];

  if (!platformLabel || !parser) {
    return jsonResponse({
      ok: false,
      error: `Unknown platform '${platformKey}'. Supported: ${Object.keys(PARSERS).join(", ")}`,
    }, 400);
  }

  const csv = await request.text();
  if (!csv || csv.length < 50) {
    return jsonResponse({ ok: false, error: "Empty or truncated CSV body" }, 400);
  }

  let parsed;
  try {
    parsed = parser(csv);
  } catch (err) {
    return jsonResponse({ ok: false, error: `Parse error: ${err.message}` }, 400);
  }

  const source = `csv:${platformKey}`;
  const importedAt = new Date().toISOString();

  /* INSERT OR REPLACE keyed on the UNIQUE(date, platform, campaign, source)
     constraint. NULL campaign is special-cased - SQLite treats NULL as
     non-equal in UNIQUE so two NULL-campaign rows for the same date
     would not be merged. We coerce NULL to '' in storage so the
     constraint behaves as expected; reads coalesce '' back to NULL. */
  const stmt = env.DB.prepare(
    `INSERT INTO ad_spend (date, platform, campaign, spend_pence, impressions, clicks, conversions, currency, source, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date, platform, campaign, source) DO UPDATE SET
       spend_pence = excluded.spend_pence,
       impressions = excluded.impressions,
       clicks = excluded.clicks,
       conversions = excluded.conversions,
       currency = excluded.currency,
       imported_at = excluded.imported_at`
  );

  const batches = [];
  for (const r of parsed.rows) {
    batches.push(stmt.bind(
      r.date,
      platformLabel,
      r.campaign || "",
      r.spend_pence,
      r.impressions,
      r.clicks,
      r.conversions,
      r.currency,
      source,
      importedAt,
    ));
  }

  let imported = 0;
  let dbError = null;
  if (batches.length > 0) {
    try {
      /* D1 batch caps at ~100 statements per call, so chunk for large CSVs.
         Google Ads daily * 90 days * 17 campaigns = ~1530 rows = 16 chunks. */
      const CHUNK = 80;
      for (let i = 0; i < batches.length; i += CHUNK) {
        const slice = batches.slice(i, i + CHUNK);
        const res = await env.DB.batch(slice);
        imported += res.length;
      }
    } catch (err) {
      dbError = err.message;
    }
  }

  /* Summary aggregate so the importer can confirm totals match the
     platform dashboard at a glance. */
  let summary = null;
  try {
    const summaryRes = await env.DB.prepare(
      `SELECT
          MIN(date) AS earliest_date,
          MAX(date) AS latest_date,
          SUM(spend_pence) AS total_spend_pence,
          SUM(impressions) AS total_impressions,
          SUM(clicks) AS total_clicks,
          SUM(conversions) AS total_conversions,
          COUNT(DISTINCT campaign) AS distinct_campaigns
         FROM ad_spend
        WHERE platform = ? AND source = ?`
    ).bind(platformLabel, source).first();
    summary = summaryRes;
  } catch (err) {
    /* non-fatal - summary is informational only */
  }

  return jsonResponse({
    ok: dbError == null,
    platform: platformLabel,
    source,
    parsed_rows: parsed.rows.length,
    skipped_rows: parsed.skipped,
    imported,
    db_error: dbError,
    summary,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
