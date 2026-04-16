/**
 * GET /api/schema-check
 *
 * Temporary diagnostic endpoint. Returns the CREATE TABLE statements and
 * column info for the main D1 tables so we can verify the live schema
 * against migrate.js. Delete after use.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TABLES = ["contacts", "visitors", "submissions", "sessions", "events", "external_events"];

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "no_db" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const out = {};

  for (const name of TABLES) {
    try {
      const sqlRow = await env.DB.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?"
      ).bind(name).first();

      const colsResult = await env.DB.prepare(`PRAGMA table_info(${name})`).all();

      let fkResult = { results: [] };
      try {
        fkResult = await env.DB.prepare(`PRAGMA foreign_key_list(${name})`).all();
      } catch (_) {}

      out[name] = {
        create_sql: sqlRow ? sqlRow.sql : null,
        columns: colsResult.results || [],
        foreign_keys: fkResult.results || [],
      };
    } catch (err) {
      out[name] = { error: err.message };
    }
  }

  return new Response(JSON.stringify({ ok: true, tables: out }, null, 2), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
