/**
 * TEMPORARY diagnostic endpoint — shows contact counts in D1.
 * DELETE THIS FILE after debugging.
 *
 * GET /api/debug-counts
 */
const CORS = {
  "access-control-allow-origin": "*",
  "content-type": "application/json",
};

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: "no DB binding" }), {
      status: 500, headers: CORS,
    });
  }

  const counts = await env.DB.prepare(`
    SELECT lead_type, COUNT(*) as total,
           SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted
    FROM contacts
    GROUP BY lead_type
    ORDER BY total DESC
  `).all();

  const recent = await env.DB.prepare(`
    SELECT contact_id, email, first_name, last_name, lead_type,
           source_channel, created_at, deleted_at
    FROM contacts
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  const submissions = await env.DB.prepare(`
    SELECT form_type, COUNT(*) as cnt
    FROM submissions
    GROUP BY form_type
  `).all();

  return new Response(JSON.stringify({
    contact_counts: counts.results,
    recent_contacts: recent.results,
    submission_counts: submissions.results,
  }, null, 2), { headers: CORS });
}
