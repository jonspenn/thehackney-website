/**
 * GET /api/schema-check
 *
 * TOMBSTONED. This endpoint was a temporary diagnostic used on
 * 2026-04-16 to verify the live D1 schema against migrate.js (see
 * commit `bd180bd` then `2b5a906`). It returned CREATE TABLE sql
 * from sqlite_master.
 *
 * Discovered: `pages deploy dist/` does NOT tear down removed
 * Pages Functions - the previous route remained live on the edge
 * after the source file was deleted. This file is now kept in the
 * repo purely to override the stale edge handler with 410 Gone,
 * ensuring the diagnostic output is no longer reachable. Safe to
 * delete after a future deploy cycle confirms the edge has fully
 * dropped the old route.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest() {
  return new Response(
    JSON.stringify({ ok: false, error: "gone", message: "Diagnostic endpoint removed." }),
    { status: 410, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
  );
}
