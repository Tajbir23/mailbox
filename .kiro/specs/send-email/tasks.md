# Implementation Plan: Send Email

## Overview

This plan implements outbound email for the receive-only Mailbox app, following the design's
two-process topology (Next.js owns the send pipeline + DB writes; `smtp-server/smtp.js` owns the
Socket.io `io` server and the new internal emit bridge). Work is sequenced bottom-up: add the new
dependency, build the pure helpers (directly property-testable), then the model and delivery agent,
then the cross-process emit bridge, then the API routes that orchestrate the full pipeline, and
finally the Compose UI and InboxView wiring.

Implementation language: **JavaScript (ESM)** — matching the existing Next.js App Router codebase
(`export`/`import`, `mongoose.models.X || mongoose.model(...)` model guard).

Property tests use **fast-check** + **Jest** (both already configured via `jest.config.js` /
`next/jest`). Each property test lives in its own file under a `__tests__`/co-located test path, is
tagged `// Feature: send-email, Property N: ...`, and runs with `{ numRuns: 100 }` (minimum 100
iterations). Tasks marked `*` are optional (tests / integration) and can be skipped for a faster MVP.

## Tasks

- [ ] 1. Project setup
  - [ ] 1.1 Add the `nodemailer` dependency
    - Add `nodemailer` to `dependencies` in `package.json` (pinned version) and install it
    - This is the only new runtime dependency required by the feature
    - _Requirements: 11.1_

- [ ] 2. Recipient, subject, content, and size validation helpers (`lib/send-validation.js`)
  - [ ] 2.1 Implement the pure validation helpers
    - Create `lib/send-validation.js` exporting `validateRecipients({ to, cc, bcc })`,
      `normalizeSubject(subject)`, `isContentEmpty({ subject, bodyText, bodyHtml })`,
      `exceedsSizeLimit({ subject, bodyText, bodyHtml, attachments })`, and
      `prefixSubject(subject, prefix)`
    - `validateRecipients` uses `sanitizeEmail` from `lib/sanitize.js`; returns
      `{ to[], cc[], bcc[], invalid: [{ field, value }] }` with accepted addresses lowercased
    - Define constants `MAX_RECIPIENTS = 50`, `MAX_SUBJECT = 998`, `MAX_TOTAL_BYTES = 25 * 1024 * 1024`
    - `normalizeSubject`: trim; empty/whitespace → `"(No Subject)"`; cap at 998 chars
    - `isContentEmpty`: true iff subject (pre-default) AND both body fields are empty/whitespace
    - `exceedsSizeLimit`: sum subject + body + attachment byte sizes; true if > 25 MiB
    - `prefixSubject`: add `"Re: "` / `"Fwd: "` once, with dedupe (idempotent)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.5, 5.3, 6.2, 7.1_

  - [ ]* 2.2 Write property test for recipient validation
    - File: `lib/__tests__/send-validation.property2.test.js`, tagged
      `// Feature: send-email, Property 2: Recipient validation identifies invalids and normalizes the rest`
    - Generators: mixed-case + malformed email strings across To/Cc/Bcc; assert `invalid` equals
      exactly the inputs where `sanitizeEmail` returns `""`, and every accepted address equals its
      lowercased `sanitizeEmail` output; run `{ numRuns: 100 }`
    - **Property 2** — **Validates: Requirements 3.2, 3.3, 3.5**

  - [ ]* 2.3 Write property test for recipient count limit
    - File: `lib/__tests__/send-validation.property3.test.js`, tagged
      `// Feature: send-email, Property 3: Recipient count limit`
    - Generators: To/Cc/Bcc list sizes spanning the 50 boundary; rejected iff combined count > 50;
      run `{ numRuns: 100 }`
    - **Property 3** — **Validates: Requirements 3.4**

  - [ ]* 2.4 Write property test for subject normalization
    - File: `lib/__tests__/send-validation.property4.test.js`, tagged
      `// Feature: send-email, Property 4: Subject normalization`
    - Generators: subjects spanning the 998 boundary and whitespace-only strings; result is
      `"(No Subject)"` when empty/whitespace, else length ≤ 998; run `{ numRuns: 100 }`
    - **Property 4** — **Validates: Requirements 4.2, 4.3**

  - [ ]* 2.5 Write property test for empty-content detection
    - File: `lib/__tests__/send-validation.property5.test.js`, tagged
      `// Feature: send-email, Property 5: Empty-content detection`
    - `isContentEmpty` true iff subject empty/whitespace AND both body fields empty/whitespace;
      run `{ numRuns: 100 }`
    - **Property 5** — **Validates: Requirements 4.1**

  - [ ]* 2.6 Write property test for total size limit accounting
    - File: `lib/__tests__/send-validation.property6.test.js`, tagged
      `// Feature: send-email, Property 6: Total size limit accounting`
    - Generators: attachment size arrays straddling 25 MiB (26,214,400 bytes); rejected iff summed
      total exceeds the limit; run `{ numRuns: 100 }`
    - **Property 6** — **Validates: Requirements 4.5, 5.3**

  - [ ]* 2.7 Write property test for subject prefixing idempotence
    - File: `lib/__tests__/send-validation.property8.test.js`, tagged
      `// Feature: send-email, Property 8: Reply/forward subject prefixing is single and idempotent`
    - Generators: subjects with zero, one, or repeated `Re: `/`Fwd: ` prefixes; result begins with
      exactly one prefix and `f(f(x)) === f(x)`; run `{ numRuns: 100 }`
    - **Property 8** — **Validates: Requirements 6.2, 7.1**

- [ ] 3. Outbound HTML sanitization (`lib/html-sanitize.js`)
  - [ ] 3.1 Implement `sanitizeOutboundHtml`
    - Create `lib/html-sanitize.js` exporting `sanitizeOutboundHtml(html)`
    - Strip `<script>` blocks, inline `on*=` handlers, and `javascript:`/`vbscript:`/`data:text/html`
      URIs, mirroring the existing conservative inline approach in `components/InboxView.js`
    - This single sanitized string is used for both storage (`SentEmail.bodyHtml`) and delivery
    - _Requirements: 4.4_

  - [ ]* 3.2 Write unit tests for `sanitizeOutboundHtml`
    - Assert `<script>` blocks, `on*=` handlers, and `javascript:`/`data:text/html` URIs are removed;
      benign markup is preserved
    - _Requirements: 4.4_

- [ ] 4. Send rate limiter with retry-after (`lib/send-rate-limit.js`)
  - [ ] 4.1 Implement `checkSendLimit`
    - Create `lib/send-rate-limit.js` exporting
      `checkSendLimit(token, { limit, windowMs }) -> { allowed, retryAfter, resetAt }`
    - In-memory rolling window keyed by token; `retryAfter` in seconds, `resetAt` epoch ms
    - Read env defaults `SEND_RATE_USER_MAX` (50), `SEND_RATE_MAILBOX_MAX` (100),
      `SEND_RATE_WINDOW_MS` (3,600,000); document the per-process limitation in a comment
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 4.2 Write property test for rate-limit counting
    - File: `lib/__tests__/send-rate-limit.property12.test.js`, tagged
      `// Feature: send-email, Property 12: Rate-limit counting`
    - For a token and limit N, first N checks within a window are allowed and every subsequent check
      is rejected; run `{ numRuns: 100 }`
    - **Property 12** — **Validates: Requirements 9.1, 9.2**

  - [ ]* 4.3 Write property test for retry-after on rejection
    - File: `lib/__tests__/send-rate-limit.property13.test.js`, tagged
      `// Feature: send-email, Property 13: Retry-after on rate-limit rejection`
    - On any rejection, `0 < retryAfter <= windowMs / 1000`; run `{ numRuns: 100 }`
    - **Property 13** — **Validates: Requirements 9.3**

- [ ] 5. Checkpoint - Ensure all helper tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. SentEmail model and record building
  - [ ] 6.1 Create the `SentEmail` model
    - Create `lib/models/SentEmail.js` with the schema from the design: `mailboxId`, `userId`, `from`,
      `to`/`cc`/`bcc`, `subject` (default `"(No Subject)"`), `bodyHtml`, `bodyText`,
      `attachments[{ filename, contentType, size, content }]`, `deliveryStatus` enum
      `["queued","sent","failed"]`, `failureReason`, `inReplyToEmailId`, `messageId`, `sentAt`,
      `{ timestamps: true }`
    - Add indexes on `mailboxId`, `userId`, `deliveryStatus`, and compound `{ mailboxId: 1, createdAt: -1 }`
    - **NO TTL index** — sent history must persist (add a comment noting this deliberate divergence
      from `IncomingEmail`'s TTL)
    - Use the `mongoose.models.SentEmail || mongoose.model(...)` guard with ESM default export
    - _Requirements: 1.3, 1.5, 8.1, 8.2, 8.4, 5.2, 6.4, 10.1, 11.4_

  - [ ] 6.2 Implement the pure record-building helper (`lib/send-record.js`)
    - Export `buildSentEmailRecord({ mailbox, userId, payload, normalizedRecipients, subject, bodyText, bodyHtml, attachments, inReplyToEmailId })`
    - Force `from` and the envelope sender to `mailbox.emailAddress` regardless of any client-supplied
      `from` (no spoofing); map attachments to `{ filename, contentType, size }` metadata for storage
    - Return both the persisted-record shape and the `envelopeFrom` used for delivery
    - _Requirements: 1.2, 5.2, 11.3_

  - [ ]* 6.3 Write property test for sender identity
    - File: `lib/__tests__/send-record.property1.test.js`, tagged
      `// Feature: send-email, Property 1: Sender identity is always the mailbox address`
    - For any payload (including spoofed/absent `from`), persisted `from` and `envelopeFrom` both
      equal `mailbox.emailAddress`; run `{ numRuns: 100 }`
    - **Property 1** — **Validates: Requirements 1.2, 11.3**

  - [ ]* 6.4 Write property test for attachment metadata preservation
    - File: `lib/__tests__/send-record.property7.test.js`, tagged
      `// Feature: send-email, Property 7: Attachment metadata preservation`
    - For any attachment list, each built `attachments[]` entry preserves input `filename`,
      `contentType`, and `size`; run `{ numRuns: 100 }`
    - **Property 7** — **Validates: Requirements 5.2**

- [ ] 7. Sent-list query shaping (`lib/sent-query.js`)
  - [ ] 7.1 Implement the pure query-shaping helpers
    - Create `lib/sent-query.js` exporting `clampLimit(limit)` (→ `[1, 100]`),
      `buildSentFilter(mailboxId)` (→ `{ mailboxId }`), and `buildSentSort()` (→ `{ createdAt: -1 }`),
      plus a pure `shapeSentResults(records, { page, limit })` that applies scope, sort, and clamp to
      an in-memory array (the model used by GET `/sent` and by the property tests)
    - _Requirements: 8.2, 8.4, 8.5_

  - [ ]* 7.2 Write property test for mailbox scoping
    - File: `lib/__tests__/sent-query.property9.test.js`, tagged
      `// Feature: send-email, Property 9: Sent retrieval is scoped to the mailbox`
    - For records across multiple mailboxes, every returned record has `mailboxId` equal to the
      requested mailbox; run `{ numRuns: 100 }`
    - **Property 9** — **Validates: Requirements 8.2**

  - [ ]* 7.3 Write property test for ordering
    - File: `lib/__tests__/sent-query.property10.test.js`, tagged
      `// Feature: send-email, Property 10: Sent retrieval ordering`
    - Results are ordered by `createdAt` non-increasing (most recent first); run `{ numRuns: 100 }`
    - **Property 10** — **Validates: Requirements 8.4**

  - [ ]* 7.4 Write property test for pagination clamp
    - File: `lib/__tests__/sent-query.property11.test.js`, tagged
      `// Feature: send-email, Property 11: Pagination clamp`
    - For any `limit` (missing, zero, negative, very large), effective page size is clamped to
      `[1, 100]` and returned count never exceeds 100; run `{ numRuns: 100 }`
    - **Property 11** — **Validates: Requirements 8.5**

- [ ] 8. Outbound delivery agent (`lib/mailer.js`)
  - [ ] 8.1 Implement the nodemailer transport and `sendMail`
    - Create `lib/mailer.js` exporting `isRelayConfigured()`, `sendMail({ envelopeFrom, from, to, cc,
      bcc, subject, text, html, attachments })`, and the `NotConfiguredError` / `DeliveryError` classes
    - Build (and memoize) the transport from `SMTP_RELAY_HOST/PORT/USER/PASS/SECURE`;
      `isRelayConfigured` requires host + port present
    - Set `envelope.from` explicitly to the Sender_Mailbox address (independent of header `From`)
    - Resolve `{ messageId }` on relay acceptance; throw `DeliveryError(reason)` on failure;
      `getTransport` throws `NotConfiguredError` when env is incomplete
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 8.2 Write integration test for relay hand-off (manual/integration)
    - Against a throwaway nodemailer test account or a local SMTP sink, assert the envelope sender
      equals the mailbox address and a `messageId` is returned (1–3 examples; not property-based —
      external/slow). Requires relay test credentials; run manually if no sink is available.
    - _Requirements: 11.1, 11.3_

- [ ] 9. Cross-process emit bridge
  - [ ] 9.1 Implement the Next.js side emit bridge (`lib/emit-bridge.js`)
    - Export `emitEmailStatus({ mailboxId, userId, payload })` that POSTs to
      `http://127.0.0.1:${INTERNAL_EMIT_PORT}/emit/email-status` with header
      `x-internal-secret: INTERNAL_EMIT_SECRET`
    - Best-effort: catch and log failures, never throw (the HTTP send response is authoritative)
    - _Requirements: 10.2_

  - [ ] 9.2 Add the internal emit HTTP endpoint to `smtp-server/smtp.js`
    - Add a localhost HTTP listener on `INTERNAL_EMIT_PORT` (default 4001) in the smtp-server process
    - Gate on `x-internal-secret === INTERNAL_EMIT_SECRET`; reject otherwise (401)
    - On `POST /emit/email-status` with `{ mailboxId, userId, payload }`, run
      `io.to(mailboxId).emit("email-status", payload)` and
      `io.to("dashboard-"+userId).emit("email-status", payload)`
    - _Requirements: 10.2_

  - [ ]* 9.3 Write integration test for the emit bridge (manual/integration)
    - With the smtp-server emit endpoint running, assert a terminal status POST results in an
      `email-status` event delivered to the `mailboxId` and `dashboard-{userId}` rooms with the
      documented payload; smoke-check that a request without the secret is rejected. Requires the
      smtp-server process; run manually.
    - _Requirements: 10.2_

- [ ] 10. Checkpoint - Ensure model, delivery, and bridge units pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Send API route (`POST /api/mailboxes/[id]/send`)
  - [ ] 11.1 Implement the send route and full pipeline
    - Create `app/api/mailboxes/[id]/send/route.js` handling `application/json` and
      `multipart/form-data` (JSON `payload` part + file parts)
    - Apply the ordered validation gate, each rejection tied to its requirement:
      auth → 401 (2.1); owner/shared → 403 (2.2); `isActive` → 403 (2.3); domain `verified` → 403
      (2.4); `isRelayConfigured` → 503 (11.2); per-user + per-mailbox `checkSendLimit` → 429 with
      `retryAfter` (9.1, 9.2, 9.3); `validateRecipients`/count → 400 with `invalid[]` (3.1, 3.2, 3.4);
      `isContentEmpty` → 400 (4.1); `exceedsSizeLimit` → 413 (4.5, 5.3)
    - Build the record with `buildSentEmailRecord`, sanitize HTML via `sanitizeOutboundHtml`,
      normalize subject; for `mode: "reply"/"forward"` load the source `IncomingEmail` server-side and
      derive fields (reply To + `inReplyToEmailId`; forward body + re-fetched attachment buffers)
    - Persist `SentEmail` with `deliveryStatus: "queued"`, return `202 { sentEmail }`, then deliver via
      `lib/mailer.js`; on success update to `sent` + `sentAt` + `messageId`, on `DeliveryError` update
      to `failed` + `failureReason`; fire `emitEmailStatus` for the terminal state
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.4, 3.5, 4.1, 4.4, 4.5, 5.1, 5.3, 6.1, 6.3, 6.4, 7.2, 7.3, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 11.2, 11.3, 11.4_

  - [ ]* 11.2 Write unit tests for the send route
    - Mock `lib/mailer.js` and `lib/emit-bridge.js`; cover auth/access/state branches (2.1–2.4),
      `queued` created before delivery (1.3), success → `sent` (1.4), failure → `failed` + reason
      (1.5, 11.4), response carries id + status (10.1), every rejection returns non-empty `error`
      (10.3), empty To rejection (3.1), reply `inReplyToEmailId` recorded (6.4), forward attachment
      inclusion (7.3), body variants text/html/both (4.4), relay not configured → 503 (11.2)
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 4.4, 6.4, 7.3, 10.1, 10.3, 11.2, 11.4_

- [ ] 12. Sent list API route (`GET /api/mailboxes/[id]/sent`)
  - [ ] 12.1 Implement the sent list route
    - Create `app/api/mailboxes/[id]/sent/route.js` using `getServerSession` + the
      `Mailbox.findOne({ _id, $or: [{ ownerId }, { sharedWith }] })` access filter (no access → 404/403,
      no records — 8.3)
    - Use `clampLimit` / `buildSentFilter` / `buildSentSort`; query `SentEmail` filtered by `mailboxId`
      (8.2), sorted `createdAt: -1` (8.4), paginated with `limit` clamped to `[1, 100]` (8.5); strip
      `attachments.content` from the response
    - Return `{ sent, total, page, limit }`
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [ ]* 12.2 Write unit tests for the sent list route
    - Cover access control (8.3 → 404/403 with no records), mailbox scoping (8.2), ordering (8.4),
      limit clamp (8.5), and that `attachments.content` is omitted
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [ ] 13. Compose UI and InboxView wiring
  - [ ] 13.1 Implement `components/Compose.js`
    - Modal/panel with To/Cc/Bcc chip inputs, subject, a body editor with a plain-text/HTML toggle,
      and attachment upload; submit via `multipart/form-data` (or JSON when no attachments) to the
      send route; render rejection `error` (and per-address `invalid[]`) and rate-limit `retryAfter`
    - _Requirements: 1.1, 1.6, 4.4, 5.1, 10.3_

  - [ ] 13.2 Wire Compose/Reply/Forward entry points into `components/InboxView.js`
    - Add a "Compose" button plus per-email **Reply** and **Forward** actions; client-side prefill
      (reply To = original sender, reply subject `Re: `, forward subject `Fwd: `, forward body
      inclusion, sender mailbox = receiving mailbox) while server-side derivation remains authoritative
    - Subscribe to the `email-status` socket event alongside the existing `new-email` handler (after
      `socket.emit("join-mailbox", mailboxId)`) to update sent status; this is a UI integration step
      verified manually in the browser
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 10.2_

- [ ] 14. Environment and configuration documentation
  - [ ] 14.1 Document the new env keys
    - Document `SMTP_RELAY_HOST/PORT/USER/PASS/SECURE`, `INTERNAL_EMIT_SECRET`, `INTERNAL_EMIT_PORT`,
      and `SEND_RATE_USER_MAX`/`SEND_RATE_MAILBOX_MAX`/`SEND_RATE_WINDOW_MS` in the project env example
      / README, noting which process consumes each and the SPF/DKIM operational prerequisite for
      deliverability
    - _Requirements: 11.1, 11.2, 9.1, 9.2, 9.3_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (unit / property / integration tests) and can be skipped for a
  faster MVP. Core implementation tasks are never marked optional.
- Each task references the specific requirement sub-clauses it implements for traceability.
- Property tests target the pure helpers (`lib/send-validation.js`, `lib/send-rate-limit.js`,
  `lib/send-record.js`, `lib/sent-query.js`); each is its own file, tagged
  `// Feature: send-email, Property N: ...`, running `{ numRuns: 100 }` (≥ 100 iterations).
- Relay delivery (8.2), the emit bridge (9.3), and the Compose/InboxView UI wiring (13.2) rely on
  external services or the browser and are verified through integration or manual testing rather than
  property tests.
- The send route returns `202 queued` immediately (Req 10.1); the terminal `sent`/`failed` state
  reaches the UI via the `email-status` real-time event (Req 10.2).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "6.1", "7.1", "9.1", "14.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "3.2", "4.2", "4.3", "6.2", "7.2", "7.3", "7.4", "8.1", "9.2", "12.1", "13.1"] },
    { "id": 2, "tasks": ["6.3", "6.4", "8.2", "9.3", "11.1", "12.2", "13.2"] },
    { "id": 3, "tasks": ["11.2"] }
  ]
}
```
