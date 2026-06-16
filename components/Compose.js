"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";

// ── Compose modal ──────────────────────────────────────────────────────────
// Self-contained new / reply / forward composer. Posts to
//   POST /api/mailboxes/[id]/send
// as application/json, or multipart/form-data (a `payload` JSON part + file
// parts) when attachments are present.
//
// Props:
//   mailboxId  – id of the sending mailbox (required)
//   open       – whether the modal is shown
//   onClose    – called when the user dismisses or after a successful send
//   initial    – optional prefill: { to, cc, bcc, subject, bodyText, bodyHtml,
//                mode, sourceEmailId } for reply / forward flows
//
// Requirements: 1.1 (compose & send), 1.6 (To/Cc/Bcc), 4.4 (text/html/both),
// 5.1 (attachments), 10.3 (surface rejection reason + invalid[] + retryAfter).

const MAX_RECIPIENTS = 50;
const MAX_SUBJECT = 998;
// 25 MiB — mirrors the server-side MAX_TOTAL_BYTES gate so the UI can warn early.
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

// Split a free-text recipient entry into individual addresses. Recipients may
// be separated by commas, semicolons, or whitespace (newline on paste).
function splitAddresses(text) {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Browser-safe UTF-8 byte length (Buffer is not available client-side).
function utf8Bytes(str) {
  if (!str) return 0;
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str).length;
  return unescape(encodeURIComponent(str)).length;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Chip-style recipient input ──────────────────────────────────────────────
function RecipientField({ label, field, values, onChange, invalidSet, autoFocus }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const commitDraft = useCallback(
    (raw) => {
      const parts = splitAddresses(raw);
      if (parts.length === 0) return;
      const next = [...values];
      for (const p of parts) {
        if (!next.includes(p)) next.push(p);
      }
      onChange(next);
      setDraft("");
    },
    [values, onChange]
  );

  const removeAt = useCallback(
    (idx) => {
      onChange(values.filter((_, i) => i !== idx));
    },
    [values, onChange]
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft(draft);
      }
    } else if (e.key === "Backspace" && !draft && values.length > 0) {
      removeAt(values.length - 1);
    }
  };

  return (
    <div className="flex items-start gap-3 px-4 py-2 border-b border-surface-100">
      <label
        className="text-xs font-semibold text-surface-500 w-10 shrink-0 pt-2 uppercase tracking-wide cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 py-1">
        {values.map((addr, idx) => {
          const bad = invalidSet.has(addr.toLowerCase());
          return (
            <span
              key={`${addr}-${idx}`}
              className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs font-medium max-w-full ${
                bad
                  ? "bg-red-50 text-red-700 border border-red-300"
                  : "bg-brand-50 text-brand-700 border border-brand-100"
              }`}
              title={bad ? `Invalid address: ${addr}` : addr}
            >
              <span className="truncate">{addr}</span>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className={`shrink-0 p-0.5 rounded-md transition-colors ${
                  bad ? "hover:bg-red-200 text-red-500" : "hover:bg-brand-200 text-brand-500"
                }`}
                title="Remove"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          inputMode="email"
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => draft.trim() && commitDraft(draft)}
          placeholder={values.length === 0 ? `${field}@example.com` : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none py-1"
        />
      </div>
    </div>
  );
}

export default function Compose({ mailboxId, open, onClose, initial = null }) {
  const toast = useToast();

  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyMode, setBodyMode] = useState("text"); // "text" | "html"
  const [attachments, setAttachments] = useState([]); // File[]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState([]); // [{ field, value }]
  const [retryAfter, setRetryAfter] = useState(0); // seconds, for 429
  const fileInputRef = useRef(null);

  // (Re)initialize all fields whenever the modal opens or the prefill changes.
  useEffect(() => {
    if (!open) return;
    setTo(initial?.to || []);
    setCc(initial?.cc || []);
    setBcc(initial?.bcc || []);
    setShowCcBcc(Boolean((initial?.cc || []).length || (initial?.bcc || []).length));
    setSubject(initial?.subject || "");
    setBodyText(initial?.bodyText || "");
    setBodyHtml(initial?.bodyHtml || "");
    // Default the editor to whichever body the prefill supplied.
    setBodyMode(initial?.bodyHtml && !initial?.bodyText ? "html" : "text");
    setAttachments([]);
    setSending(false);
    setError("");
    setInvalid([]);
    setRetryAfter(0);
  }, [open, initial]);

  // Esc closes the modal (only while not actively sending).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !sending) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending, onClose]);

  // Countdown for the rate-limit retry hint.
  useEffect(() => {
    if (retryAfter <= 0) return;
    const t = setInterval(() => {
      setRetryAfter((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [retryAfter]);

  const mode = initial?.mode || "new";
  const sourceEmailId = initial?.sourceEmailId || null;

  const recipientCount = to.length + cc.length + bcc.length;
  const attachmentBytes = useMemo(
    () => attachments.reduce((sum, f) => sum + (f.size || 0), 0),
    [attachments]
  );
  const contentBytes =
    attachmentBytes +
    utf8Bytes(subject) +
    utf8Bytes(bodyText) +
    utf8Bytes(bodyHtml);

  // A set of invalid addresses (lowercased) for chip highlighting (Req 10.3).
  const invalidSet = useMemo(
    () => new Set(invalid.map((i) => String(i.value || "").toLowerCase())),
    [invalid]
  );

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    setAttachments((prev) => {
      // De-dupe by name+size so re-selecting the same file is a no-op.
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      for (const f of incoming) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(f);
        }
      }
      return merged;
    });
  }, []);

  const removeAttachment = useCallback((idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Client-side pre-checks mirror the server gate so users get instant feedback;
  // the server remains authoritative.
  const validateLocal = useCallback(() => {
    if (to.length === 0) return "At least one recipient is required";
    if (recipientCount > MAX_RECIPIENTS)
      return `Recipient limit of ${MAX_RECIPIENTS} exceeded`;
    const subjEmpty = !subject.trim();
    const bodyEmpty = !bodyText.trim() && !bodyHtml.trim();
    if (subjEmpty && bodyEmpty) return "Message content is required";
    if (contentBytes > MAX_TOTAL_BYTES) return "Message exceeds the 25MB size limit";
    return "";
  }, [to, recipientCount, subject, bodyText, bodyHtml, contentBytes]);

  const handleSend = useCallback(async () => {
    if (sending) return;
    setError("");
    setInvalid([]);
    setRetryAfter(0);

    const localErr = validateLocal();
    if (localErr) {
      setError(localErr);
      return;
    }

    // Build the payload. Send both body fields so text-only, html-only, or
    // both are all supported (Req 4.4); empty ones are harmless.
    const payload = {
      to,
      cc,
      bcc,
      subject: subject.slice(0, MAX_SUBJECT),
      bodyText,
      bodyHtml,
      mode,
    };
    if (sourceEmailId) payload.sourceEmailId = sourceEmailId;

    setSending(true);
    try {
      let res;
      if (attachments.length > 0) {
        // multipart: a JSON `payload` part plus one file part per attachment.
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        for (const file of attachments) {
          fd.append("attachments", file, file.name);
        }
        res = await fetch(`/api/mailboxes/${mailboxId}/send`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(`/api/mailboxes/${mailboxId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 202 || res.ok) {
        toast.success("Message queued for delivery");
        onClose?.(data?.sentEmail || null);
        return;
      }

      // Rejection — surface the reason (Req 10.3).
      if (res.status === 429) {
        const secs = Number(data?.retryAfter) || 0;
        if (secs > 0) setRetryAfter(secs);
        setError(data?.error || "Rate limit exceeded");
      } else {
        if (Array.isArray(data?.invalid)) setInvalid(data.invalid);
        setError(data?.error || `Failed to send (status ${res.status})`);
      }
    } catch (err) {
      console.error("Send failed:", err);
      setError("Could not reach the server. Please try again.");
    } finally {
      setSending(false);
    }
  }, [
    sending,
    validateLocal,
    to,
    cc,
    bcc,
    subject,
    bodyText,
    bodyHtml,
    mode,
    sourceEmailId,
    attachments,
    mailboxId,
    toast,
    onClose,
  ]);

  if (!open) return null;

  const heading =
    mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message";
  const overSize = contentBytes > MAX_TOTAL_BYTES;
  const overRecipients = recipientCount > MAX_RECIPIENTS;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !sending && onClose?.()}
      />
      <div className="relative card w-[min(96vw,640px)] max-h-[92vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shrink-0 shadow-brand-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-surface-900 truncate">{heading}</h3>
          </div>
          <button
            onClick={() => !sending && onClose?.()}
            disabled={sending}
            className="w-8 h-8 rounded-xl bg-surface-100 hover:bg-surface-200 flex items-center justify-center text-surface-500 hover:text-surface-700 transition-all disabled:opacity-50"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Error banner (Req 10.3) */}
          {error && (
            <div className="mx-4 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2.5">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              <div className="min-w-0">
                <p className="font-medium break-words">{error}</p>
                {invalid.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                    {invalid.map((i, idx) => (
                      <li key={`${i.field}-${i.value}-${idx}`} className="break-all">
                        <span className="uppercase font-semibold">{i.field}</span>: {i.value}
                      </li>
                    ))}
                  </ul>
                )}
                {retryAfter > 0 && (
                  <p className="mt-1 text-xs text-red-600">
                    You can try again in {retryAfter} second{retryAfter === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Recipients */}
          <div className="mt-2">
            <div className="relative">
              <RecipientField
                label="To"
                field="to"
                values={to}
                onChange={setTo}
                invalidSet={invalidSet}
                autoFocus
              />
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="absolute right-4 top-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Cc / Bcc
                </button>
              )}
            </div>
            {showCcBcc && (
              <>
                <RecipientField label="Cc" field="cc" values={cc} onChange={setCc} invalidSet={invalidSet} />
                <RecipientField label="Bcc" field="bcc" values={bcc} onChange={setBcc} invalidSet={invalidSet} />
              </>
            )}
          </div>

          {/* Recipient count hint */}
          {recipientCount > 0 && (
            <div className={`px-4 pt-1.5 text-[11px] ${overRecipients ? "text-red-600 font-medium" : "text-surface-400"}`}>
              {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
              {overRecipients && ` — limit is ${MAX_RECIPIENTS}`}
            </div>
          )}

          {/* Subject */}
          <div className="px-4 py-2 border-b border-surface-100">
            <input
              type="text"
              value={subject}
              maxLength={MAX_SUBJECT}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full bg-transparent text-sm font-medium text-surface-800 placeholder:text-surface-400 focus:outline-none py-1.5"
            />
          </div>

          {/* Body editor with plain-text / HTML toggle (Req 4.4) */}
          <div className="px-4 pt-3">
            <div className="flex items-center gap-1 mb-2">
              <div className="inline-flex rounded-lg bg-surface-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setBodyMode("text")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    bodyMode === "text" ? "bg-white text-surface-800 shadow-sm" : "text-surface-500 hover:text-surface-700"
                  }`}
                >
                  Plain text
                </button>
                <button
                  type="button"
                  onClick={() => setBodyMode("html")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    bodyMode === "html" ? "bg-white text-surface-800 shadow-sm" : "text-surface-500 hover:text-surface-700"
                  }`}
                >
                  HTML
                </button>
              </div>
              {bodyMode === "html" && (
                <span className="text-[11px] text-surface-400 ml-1">
                  Write raw HTML — it is sanitized before sending
                </span>
              )}
            </div>

            {bodyMode === "text" ? (
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write your message…"
                rows={10}
                className="w-full px-3 py-2.5 bg-surface-50 border border-surface-100 rounded-xl text-sm text-surface-800 placeholder:text-surface-400 focus:bg-white focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all resize-y font-sans leading-relaxed"
              />
            ) : (
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="<p>Write your HTML message…</p>"
                rows={10}
                spellCheck={false}
                className="w-full px-3 py-2.5 bg-surface-50 border border-surface-100 rounded-xl text-sm text-surface-800 placeholder:text-surface-400 focus:bg-white focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all resize-y font-mono text-[13px] leading-relaxed"
              />
            )}
          </div>

          {/* Attachments (Req 5.1) */}
          <div className="px-4 py-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = ""; // allow re-selecting the same file
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 text-xs font-semibold text-surface-600 hover:text-brand-600 hover:bg-brand-50 border border-surface-200 hover:border-brand-200 px-3 py-1.5 rounded-lg transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              Attach files
            </button>

            {attachments.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {attachments.map((file, idx) => (
                  <li
                    key={`${file.name}-${file.size}-${idx}`}
                    className="flex items-center gap-2.5 px-3 py-2 bg-surface-50 border border-surface-100 rounded-lg"
                  >
                    <div className="w-7 h-7 rounded-md bg-brand-50 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-surface-800 truncate">{file.name}</p>
                      <p className="text-[11px] text-surface-400">
                        {formatBytes(file.size)}
                        {file.type ? ` · ${file.type}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="shrink-0 p-1 rounded-md text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove attachment"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface-50/60 border-t border-surface-100 flex items-center justify-between gap-3 shrink-0">
          <span className={`text-[11px] ${overSize ? "text-red-600 font-medium" : "text-surface-400"}`}>
            {formatBytes(contentBytes)} / 25 MB
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => !sending && onClose?.()} disabled={sending} className="btn-ghost text-sm py-2 px-4">
              Cancel
            </button>
            <button onClick={handleSend} disabled={sending} className="btn-primary text-sm py-2 px-5">
              {sending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
