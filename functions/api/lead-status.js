/**
 * POST /api/lead-status
 *
 * Updates a lead's funnel stage in D1. Used by Hugo from the admin dashboard
 * to record offline actions: meeting happened, proposal sent, won, lost.
 *
 * For "won" actions on wedding leads, accepts hire_fee and min_spend
 * (pre-filled from rate card lookup, confirmed/adjusted by Hugo).
 * deal_value = hire_fee + min_spend.
 *
 * Body:
 *   {
 *     contact_id: string (required),
 *     action: "meeting" | "cancelled" | "noshow" | "proposal" | "won" | "lost" (required),
 *     lost_reason: string (required if action=lost),
 *     lost_reason_note: string (optional, for action=lost),
 *     hire_fee: number (optional, for action=won),
 *     min_spend: number (optional, for action=won),
 *     rate_card_tier: string (optional, audit trail e.g. "2027/jun/sat"),
 *     timestamp: ISO string (optional, defaults to now),
 *   }
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_ACTIONS = ["meeting", "cancelled", "noshow", "proposal", "won", "lost", "revert"];
const VALID_LOST_REASONS = [
  "booked_elsewhere",
  "budget",
  "date_unavailable",
  "changed_plans",
  "no_response",
  "not_a_fit",
  "other",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) return json({ ok: false, error: "no_db" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const { contact_id, action, lost_reason, lost_reason_note, hire_fee, min_spend, rate_card_tier, timestamp } = body;

  // Validate required fields
  if (!contact_id) return json({ ok: false, error: "missing_contact_id" }, 400);
  if (!VALID_ACTIONS.includes(action)) {
    return json({ ok: false, error: "invalid_action", valid: VALID_ACTIONS }, 400);
  }
  if (action === "lost" && !VALID_LOST_REASONS.includes(lost_reason)) {
    return json({ ok: false, error: "invalid_lost_reason", valid: VALID_LOST_REASONS }, 400);
  }

  const now = timestamp || new Date().toISOString();

  try {
    // Verify contact exists
    const contact = await env.DB.prepare(
      "SELECT contact_id, lead_type FROM contacts WHERE contact_id = ?"
    ).bind(contact_id).first();

    if (!contact) return json({ ok: false, error: "contact_not_found" }, 404);

    // Build the update based on action
    let sql;
    let binds;

    switch (action) {
      case "meeting":
        sql = `UPDATE contacts SET meeting_at = ?, funnel_stage = 'meeting', stage_entered_at = ? WHERE contact_id = ?`;
        binds = [now, now, contact_id];
        break;

      case "cancelled":
        sql = `UPDATE contacts SET cancelled_at = ?, funnel_stage = 'cancelled', stage_entered_at = ? WHERE contact_id = ?`;
        binds = [now, now, contact_id];
        break;

      case "noshow":
        sql = `UPDATE contacts SET noshow_at = ?, funnel_stage = 'noshow', stage_entered_at = ? WHERE contact_id = ?`;
        binds = [now, now, contact_id];
        break;

      case "proposal":
        sql = `UPDATE contacts SET proposal_at = ?, funnel_stage = 'proposal', stage_entered_at = ? WHERE contact_id = ?`;
        binds = [now, now, contact_id];
        break;

      case "won": {
        const hf = typeof hire_fee === "number" ? hire_fee : null;
        const ms = typeof min_spend === "number" ? min_spend : null;
        const dv = (hf !== null && ms !== null) ? hf + ms : null;
        const tier = rate_card_tier || null;

        sql = `UPDATE contacts SET won_at = ?, funnel_stage = 'won', stage_entered_at = ?,
               hire_fee = ?, min_spend = ?, deal_value = ?, rate_card_tier = ?,
               contact_type = 'customer'
               WHERE contact_id = ?`;
        binds = [now, now, hf, ms, dv, tier, contact_id];
        break;
      }

      case "lost":
        sql = `UPDATE contacts SET lost_at = ?, funnel_stage = 'lost', stage_entered_at = ?,
               lost_reason = ?, lost_reason_note = ?
               WHERE contact_id = ?`;
        binds = [now, now, lost_reason, lost_reason_note || null, contact_id];
        break;

      case "revert": {
        // Read current state to determine what to clear
        const current = await env.DB.prepare(
          `SELECT funnel_stage, meeting_at, proposal_at, won_at, lost_at, cancelled_at, noshow_at
           FROM contacts WHERE contact_id = ?`
        ).bind(contact_id).first();

        if (!current) {
          return json({ ok: false, error: "nothing_to_revert" }, 400);
        }

        // Compute effective stage: use stored funnel_stage, or derive from timestamps
        // (mirrors client-side computeFunnelStage logic)
        let stage = current.funnel_stage;
        if (!stage) {
          if (current.won_at) stage = "won";
          else if (current.lost_at) stage = "lost";
          else if (current.proposal_at) stage = "proposal";
          else if (current.noshow_at) stage = "noshow";
          else if (current.cancelled_at) stage = "cancelled";
          else if (current.meeting_at) stage = "meeting";
          else return json({ ok: false, error: "nothing_to_revert" }, 400);
        }

        // Clear the fields for the current manual stage, let computeFunnelStage recalculate
        switch (stage) {
          case "won":
            sql = `UPDATE contacts SET won_at = NULL, hire_fee = NULL, min_spend = NULL,
                   deal_value = NULL, rate_card_tier = NULL, funnel_stage = NULL, stage_entered_at = NULL,
                   contact_type = 'lead'
                   WHERE contact_id = ?`;
            binds = [contact_id];
            break;
          case "lost":
            sql = `UPDATE contacts SET lost_at = NULL, lost_reason = NULL, lost_reason_note = NULL,
                   funnel_stage = NULL, stage_entered_at = NULL
                   WHERE contact_id = ?`;
            binds = [contact_id];
            break;
          case "proposal":
            sql = `UPDATE contacts SET proposal_at = NULL, funnel_stage = NULL, stage_entered_at = NULL
                   WHERE contact_id = ?`;
            binds = [contact_id];
            break;
          case "meeting":
            sql = `UPDATE contacts SET meeting_at = NULL, funnel_stage = NULL, stage_entered_at = NULL
                   WHERE contact_id = ?`;
            binds = [contact_id];
            break;
          case "cancelled":
            sql = `UPDATE contacts SET cancelled_at = NULL, funnel_stage = NULL, stage_entered_at = NULL
                   WHERE contact_id = ?`;
            binds = [contact_id];
            break;
          case "noshow":
            sql = `UPDATE contacts SET noshow_at = NULL, funnel_stage = NULL, stage_entered_at = NULL
                   WHERE contact_id = ?`;
            binds = [contact_id];
            break;
          default:
            return json({ ok: false, error: "cannot_revert_auto_stage" }, 400);
        }

        console.log("[lead-status] revert", JSON.stringify({ contact_id, from_stage: stage }));
        break;
      }
    }

    await env.DB.prepare(sql).bind(...binds).run();

    console.log("[lead-status]", JSON.stringify({ contact_id, action, ts: now }));

    return json({ ok: true, contact_id, action, timestamp: now });
  } catch (err) {
    console.error("[lead-status] D1 error:", err.message);
    return json({ ok: false, error: "server_error" }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
