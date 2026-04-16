/**
 * Fallback lead-notification email.
 *
 * Belt-and-braces for /api/submit. Every form submission fires an email
 * to env.LEAD_NOTIFICATION_EMAIL (default leads@thehackney.co) via Resend,
 * carrying the full payload as both a formatted HTML summary and a raw
 * JSON block. The email send is INDEPENDENT of the D1 write: even if D1
 * is entirely down, broken, or mid-migration, Jon / Hugo / Eva still get
 * a human-readable email with the lead's name, email, phone, event
 * details, and attribution, and can respond manually.
 *
 * Design principles:
 *
 *   1. NEVER throw. The caller fires this with ctx.waitUntil() so any
 *      exception here would be silent, but a throw would also escape
 *      up through waitUntil and potentially log-spam. We catch
 *      everything and log to console.error - recoverable from
 *      Cloudflare tail logs if it matters.
 *
 *   2. NEVER block. The caller must NOT await this directly. Use
 *      ctx.waitUntil(notifyLead(...)) so the client response goes out
 *      the moment D1 succeeds (or fails). Resend typically responds
 *      in 100-400ms; we don't want that latency on every form submit.
 *
 *   3. ALWAYS log the payload first. Before attempting any network
 *      call, dump a JSON line to console.log so the full payload is
 *      recoverable from CF logs even if Resend is also down. Belt.
 *      Braces. Parachute.
 *
 *   4. Config via env vars. RESEND_API_KEY and LEAD_NOTIFICATION_EMAIL
 *      live in the Cloudflare Pages dashboard as encrypted secrets.
 *      If RESEND_API_KEY is missing we skip the send gracefully (logs
 *      a warning) rather than erroring - useful for dev / preview
 *      environments that shouldn't email real people.
 *
 *   5. Graceful HTML. Missing fields render as "-" not "undefined".
 *      The subject line is the most important content because mobile
 *      push notifications only show the subject: {Lead type} enquiry
 *      - {Name} - {Event date or "date TBC"}
 */

const FROM_ADDRESS = "The Hackney <noreply@thehackney.co>";
const DEFAULT_TO = "leads@thehackney.co";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Map internal form_type to a readable noun for the subject line.
const FORM_LABELS = {
  "wedding-quiz": "Wedding enquiry",
  "corporate-quiz": "Corporate enquiry",
  "brochure-download": "Brochure download",
  "supperclub-signup": "Supper club signup",
};

// Map brochure_type to a readable noun for brochure-download subject lines.
const BROCHURE_LABELS = {
  wedding: "Wedding",
  corporate: "Corporate",
  "private-events": "Private events",
  "supper-club": "Supper club",
  "cafe-bar": "Cafe-bar",
};

function esc(val) {
  if (val === null || val === undefined || val === "") return "-";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fullName(first, last) {
  const parts = [first, last].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function buildSubject(body) {
  const formType = body.form_type;
  const fd = body.form_data || {};
  const name = fullName(body.first_name, body.last_name) || body.email || "(no name)";

  let label = FORM_LABELS[formType] || "New lead";
  if (formType === "brochure-download") {
    const bt = fd.brochure_type;
    if (bt && BROCHURE_LABELS[bt]) {
      label = `${BROCHURE_LABELS[bt]} brochure download`;
    }
  }

  const eventDate = fd.event_date || fd.wedding_date || null;
  const tail = eventDate ? ` - ${eventDate}` : "";
  return `[Hackney lead] ${label} - ${name}${tail}`;
}

function buildHtml(body, meta) {
  const fd = body.form_data || {};
  const name = fullName(body.first_name, body.last_name);
  const rows = [
    ["Form", FORM_LABELS[body.form_type] || body.form_type],
    ["Name", name],
    ["Email", body.email],
    ["Phone", body.phone],
    ["Company", body.company],
    ["Event date", fd.event_date || fd.wedding_date],
    ["Event type", fd.event_type],
    ["Guest count", fd.guest_count],
    ["Budget", fd.budget],
    ["Booking urgency", fd.booking_urgency],
    ["Brochure type", fd.brochure_type],
    ["Wedding year", fd.wedding_year],
    ["Visitor ID", meta.visitorId],
    ["Submitted at", meta.now],
    ["Referrer", meta.referrer],
    ["User agent", meta.userAgent],
  ];

  const rowHtml = rows
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b6258;font-family:'DM Sans',Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;vertical-align:top;">${esc(k)}</td>
          <td style="padding:6px 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#2C1810;">${esc(v)}</td>
        </tr>`,
    )
    .join("");

  const rawJson = esc(JSON.stringify(body, null, 2));

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#F5F0E8;">
  <table role="presentation" style="max-width:620px;margin:0 auto;background:#FFFFFE;border:1px solid rgba(44,24,16,0.12);border-radius:2px;">
    <tr>
      <td style="padding:24px 24px 8px;border-bottom:1px solid rgba(44,24,16,0.08);">
        <div style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.12em;color:#BF7256;text-transform:uppercase;">New lead - belt-and-braces copy</div>
        <h1 style="margin:4px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;color:#2C1810;">${esc(FORM_LABELS[body.form_type] || body.form_type)}</h1>
        <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#6b6258;margin-top:4px;">${esc(name || body.email)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 8px;">
        <table role="presentation" style="width:100%;">${rowHtml}</table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 24px;">
        <div style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#6b6258;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Raw payload</div>
        <pre style="margin:0;padding:12px;background:rgba(44,24,16,0.04);border:1px solid rgba(44,24,16,0.08);border-radius:2px;font-family:'SFMono-Regular','Menlo',Consolas,monospace;font-size:11px;color:#2C1810;white-space:pre-wrap;word-break:break-word;">${rawJson}</pre>
        <p style="margin:16px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#6b6258;line-height:1.5;">
          This email is fired by every /api/submit call, independent of the D1 write.
          If D1 succeeded, the lead is already in the admin dashboard.
          If D1 failed, this email is the source of record - reply to the lead directly
          or re-enter the payload once the platform is back.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(body, meta) {
  const fd = body.form_data || {};
  const name = fullName(body.first_name, body.last_name);
  const lines = [
    `New lead - belt-and-braces copy`,
    ``,
    `Form: ${FORM_LABELS[body.form_type] || body.form_type}`,
    `Name: ${name || "-"}`,
    `Email: ${body.email || "-"}`,
    `Phone: ${body.phone || "-"}`,
    `Company: ${body.company || "-"}`,
    `Event date: ${fd.event_date || fd.wedding_date || "-"}`,
    `Event type: ${fd.event_type || "-"}`,
    `Guest count: ${fd.guest_count || "-"}`,
    `Budget: ${fd.budget || "-"}`,
    `Booking urgency: ${fd.booking_urgency || "-"}`,
    `Brochure type: ${fd.brochure_type || "-"}`,
    `Wedding year: ${fd.wedding_year || "-"}`,
    `Visitor ID: ${meta.visitorId || "-"}`,
    `Submitted at: ${meta.now || "-"}`,
    `Referrer: ${meta.referrer || "-"}`,
    ``,
    `Raw payload:`,
    JSON.stringify(body, null, 2),
    ``,
    `--`,
    `This email is fired by every /api/submit call, independent of the D1 write.`,
    `If D1 succeeded, the lead is already in the admin dashboard.`,
    `If D1 failed, this email is the source of record.`,
  ];
  return lines.join("\n");
}

/**
 * Fire a fallback notification email via Resend.
 *
 * ALWAYS call this via ctx.waitUntil() - never await directly. The caller's
 * main response must NOT block on this.
 *
 * @param {object} body - The parsed JSON body the client POSTed.
 * @param {object} meta - Extras the client can't send: { visitorId, now, referrer, userAgent }.
 * @param {object} env  - The Pages Functions env object (needs RESEND_API_KEY + LEAD_NOTIFICATION_EMAIL).
 */
export async function notifyLead(body, meta, env) {
  // Always dump the payload to CF logs first, so a failure here still
  // leaves a trace we can pull from Cloudflare dashboard > Logs.
  try {
    console.log(
      "[notify-lead] payload",
      JSON.stringify({
        form_type: body.form_type,
        email: body.email,
        first_name: body.first_name,
        last_name: body.last_name,
        phone: body.phone,
        ts: meta.now,
      }),
    );
  } catch {
    /* best-effort log - don't block on log failure */
  }

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[notify-lead] RESEND_API_KEY not set - skipping email. Fallback is log-only in this env.",
    );
    return;
  }

  const to = env.LEAD_NOTIFICATION_EMAIL || DEFAULT_TO;
  const subject = buildSubject(body);
  const html = buildHtml(body, meta);
  const text = buildText(body, meta);

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
        text,
        reply_to: body.email || undefined,
      }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "(no body)");
      console.error(
        "[notify-lead] Resend non-2xx",
        JSON.stringify({ status: r.status, body: errText.slice(0, 500) }),
      );
      return;
    }
    const j = await r.json().catch(() => null);
    console.log(
      "[notify-lead] sent",
      JSON.stringify({ id: j && j.id, to, subject }),
    );
  } catch (err) {
    // Resend outage, DNS failure, cold fetch - swallow. Log-line above is
    // the recoverable trace.
    console.error(
      "[notify-lead] fetch failed",
      err && err.message,
      err && err.stack,
    );
  }
}
