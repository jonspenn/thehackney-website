/**
 * Form submission helper with split-failure handling.
 *
 * Two very different failure modes deserve two very different UX outcomes:
 *
 *   1) HTTP 4xx / { ok: false, error: "invalid_email" etc }
 *      = the user's data is wrong. We stop, tell them, and let them fix it.
 *      Returning `{ ok: false, queued: false, userMessage }` tells the caller
 *      NOT to advance past the capture step.
 *
 *   2) HTTP 5xx, network error, aborted fetch
 *      = our server / their wifi misbehaved. The data is good. We stash the
 *      payload in localStorage and let the user proceed to the confirmation
 *      screen uninterrupted. The queue is drained:
 *        - whenever any submit succeeds (opportunistic)
 *        - on `window` load (next page navigation)
 *        - on the `online` event (connectivity regained)
 *
 * This fixes the silent-failure bug where WeddingQuiz / CorporateQuiz
 * advanced to confirmation regardless of whether /api/submit actually
 * wrote a contact to D1.
 */

const QUEUE_KEY = "thk_pending_submits";
const MAX_ATTEMPTS = 5;
const QUEUE_CAP = 20;
const SUBMIT_URL = "/api/submit";

function readQueue() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage quota / private mode - nothing we can do */
  }
}

function enqueue(payload) {
  const q = readQueue();
  q.push({ payload, queuedAt: Date.now(), attempts: 0 });
  // Bound the queue so a broken endpoint can't fill localStorage
  if (q.length > QUEUE_CAP) q.splice(0, q.length - QUEUE_CAP);
  writeQueue(q);
}

function friendlyError(serverError) {
  if (serverError === "invalid_email") {
    return "That email address doesn't look right. Please check it and try again.";
  }
  if (serverError === "invalid_form_type" || serverError === "bad_json") {
    return "Something went wrong on our end. Please refresh the page and try again.";
  }
  return "Something went wrong. Please try again, or email hello@thehackney.co and we'll pick this up directly.";
}

/**
 * POST a form payload to /api/submit.
 *
 * Returns:
 *   { ok: true,  contactId, queued: false }                    - success, advance UI
 *   { ok: false, queued: true }                                - transient failure, advance UI (background retry)
 *   { ok: false, queued: false, userMessage, error }           - permanent failure, stay on step, show message
 */
export async function submitFormWithRetry(payload) {
  let res;
  try {
    res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Network error, CORS, abort, offline - treat as transient
    console.warn("[form-submit] network error, queued for retry", err?.message);
    enqueue(payload);
    return { ok: false, queued: true };
  }

  // 5xx server error - transient, queue and let UI advance
  if (res.status >= 500) {
    console.warn("[form-submit] server error, queued for retry", res.status);
    enqueue(payload);
    return { ok: false, queued: true };
  }

  let result = null;
  try {
    result = await res.json();
  } catch {
    result = null;
  }

  // Success: opportunistically drain any queue and return contact_id
  if (res.ok && result && result.ok) {
    drainQueue().catch(() => {});
    return { ok: true, contactId: result.contact_id, queued: false };
  }

  // 4xx or 2xx-with-ok:false - permanent failure, show error
  const serverError = (result && result.error) || ("http_" + res.status);
  return {
    ok: false,
    queued: false,
    userMessage: friendlyError(result && result.error),
    error: serverError,
  };
}

/**
 * Replay any queued submits. Best-effort: drops items that hit MAX_ATTEMPTS
 * or that the server rejects (4xx - the data was bad, retrying won't help).
 * Exported for explicit call sites (tests, manual triggers).
 */
export async function drainQueue() {
  if (typeof fetch === "undefined") return;
  const q = readQueue();
  if (q.length === 0) return;

  const remaining = [];
  for (const item of q) {
    if (item.attempts >= MAX_ATTEMPTS) continue; // give up

    try {
      const res = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      if (res.status >= 500) {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      } else if (res.ok) {
        console.log("[form-submit] drained queued submit for", item.payload?.email);
      } else {
        // 4xx - data was bad, no point retrying
        console.warn("[form-submit] dropping queued submit, server rejected",
          item.payload?.email, res.status);
      }
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }
  writeQueue(remaining);
}

// Auto-drain on page load + when connectivity comes back
if (typeof window !== "undefined") {
  // Defer so we don't compete with hydration
  if (document.readyState === "complete") {
    setTimeout(drainQueue, 1500);
  } else {
    window.addEventListener("load", () => setTimeout(drainQueue, 1500), { once: true });
  }
  window.addEventListener("online", () => drainQueue().catch(() => {}));
}
