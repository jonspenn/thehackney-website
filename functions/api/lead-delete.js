/**
 * POST /api/lead-delete
 *
 * Soft-deletes or restores leads in D1. Sets deleted_at timestamp
 * (soft delete) or clears it (restore). Leads with deleted_at set
 * are filtered out of the main leads query but visible in the
 * recycle bin view.
 *
 * Body:
 *   {
 *     contact_ids: number[] (required, 1-50 IDs),
 *     action: "delete" | "restore" (required),
 *   }
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { contact_ids, action } = body || {};

  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return json({ error: "contact_ids must be a non-empty array" }, 400);
  }
  if (contact_ids.length > 50) {
    return json({ error: "Maximum 50 leads per request" }, 400);
  }
  if (!["delete", "restore"].includes(action)) {
    return json({ error: "action must be 'delete' or 'restore'" }, 400);
  }

  if (!env.DB) {
    return json({ error: "Database not available" }, 500);
  }

  try {
    const now = new Date().toISOString();
    const placeholders = contact_ids.map(() => "?").join(",");

    if (action === "delete") {
      await env.DB.prepare(
        `UPDATE contacts SET deleted_at = ? WHERE contact_id IN (${placeholders}) AND deleted_at IS NULL`
      ).bind(now, ...contact_ids).run();
    } else {
      await env.DB.prepare(
        `UPDATE contacts SET deleted_at = NULL WHERE contact_id IN (${placeholders}) AND deleted_at IS NOT NULL`
      ).bind(...contact_ids).run();
    }

    return json({ ok: true, action, count: contact_ids.length });
  } catch (err) {
    console.error("[lead-delete] D1 error:", err);
    return json({ error: "Database error" }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method Not Allowed", { status: 405 });
}
