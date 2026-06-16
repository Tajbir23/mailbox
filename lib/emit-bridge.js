/**
 * Internal Emit Bridge (Next.js side) — Requirement 10.2
 *
 * The Socket.io `io` server does NOT live in the Next.js process; it lives in the
 * standalone `smtp-server/smtp.js` process. The Next.js app is only a socket.io
 * client, so the send API route cannot emit real-time events directly.
 *
 * This module performs a signed, server-to-server HTTP POST to the smtp-server
 * process's internal emit endpoint, asking it to emit a scoped `email-status`
 * event to the `mailboxId` room and the `dashboard-{userId}` room.
 *
 * Best-effort by design: the send HTTP response already carries the authoritative
 * delivery status (Req 10.1), so a failure to reach the emit endpoint must never
 * throw or fail the send. All failures are caught and logged.
 *
 * Env (see design "Environment / Configuration Additions"):
 *   - INTERNAL_EMIT_PORT   localhost port of the emit endpoint (default 4001)
 *   - INTERNAL_EMIT_SECRET shared secret sent as `x-internal-secret`
 */

const INTERNAL_EMIT_PORT_DEFAULT = 4001;

/** Resolve the emit endpoint port from env, falling back to the default. */
function getEmitPort() {
  const parsed = Number.parseInt(process.env.INTERNAL_EMIT_PORT, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : INTERNAL_EMIT_PORT_DEFAULT;
}

// How long to wait before abandoning the emit so a hung endpoint can't block the
// caller's request lifecycle.
const EMIT_TIMEOUT_MS = 2000;

/**
 * Ask the smtp-server process to emit an `email-status` event for a terminal
 * delivery state. Best-effort: never throws.
 *
 * @param {object} args
 * @param {string} args.mailboxId - room id for the mailbox subscribers.
 * @param {string} args.userId    - sending user id (maps to `dashboard-{userId}` room).
 * @param {object} args.payload   - the `email-status` event payload (see design).
 * @returns {Promise<boolean>} true when the endpoint acknowledged, false otherwise.
 */
export async function emitEmailStatus({ mailboxId, userId, payload }) {
  const port = getEmitPort();
  const url = `http://127.0.0.1:${port}/emit/email-status`;

  // Short timeout so a hung emit endpoint doesn't block the caller.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMIT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_EMIT_SECRET || "",
      },
      body: JSON.stringify({ mailboxId, userId, payload }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        `[emit-bridge] emit endpoint responded ${res.status} ${res.statusText}`
      );
      return false;
    }

    return true;
  } catch (err) {
    // Swallow all errors (network, abort/timeout, etc.) — the send response is
    // authoritative, so a failed emit must not surface to the caller.
    console.error("[emit-bridge] failed to emit email-status:", err?.message || err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
