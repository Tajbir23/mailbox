"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
const STORAGE_KEY = "mailboxsaas:public-mailboxes";

function loadSaved() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function sanitizeHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "blocked:")
    .replace(/vbscript\s*:/gi, "blocked:")
    .replace(/data\s*:\s*text\/html/gi, "blocked:");
}

function EmailHtmlFrame({ html }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(280);

  useEffect(() => {
    if (!iframeRef.current || !html) return;
    const sanitized = sanitizeHtml(html);
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.6;color:#1e293b;word-wrap:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto}a{color:#6366f1}table{max-width:100%!important;width:auto!important}pre{white-space:pre-wrap;overflow-x:auto}</style></head><body>${sanitized}</body></html>`;
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;

    const iframe = iframeRef.current;
    const handleLoad = () => {
      try {
        const h =
          iframe.contentDocument?.documentElement?.scrollHeight ||
          iframe.contentWindow?.document?.body?.scrollHeight;
        if (h) setHeight(Math.min(Math.max(h + 32, 200), 1500));
      } catch {}
      URL.revokeObjectURL(url);
    };
    iframe.addEventListener("load", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      URL.revokeObjectURL(url);
    };
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      title="Email content"
      className="w-full border-0 rounded-xl bg-white"
      style={{ height: `${height}px`, minHeight: "200px" }}
    />
  );
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function parseSender(from) {
  if (!from) return { name: "Unknown", email: "" };
  const match = from.match(/^"?([^"<]+?)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  const emailOnly = from.match(/<?([\w.+-]+@[\w.-]+)>?/);
  if (emailOnly) return { name: emailOnly[1].split("@")[0], email: emailOnly[1] };
  return { name: from.trim(), email: "" };
}

export default function PublicInboxSaver() {
  const [saved, setSaved] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [emails, setEmails] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pulse, setPulse] = useState(false);
  const socketRef = useRef(null);

  // ── Load from localStorage on mount ──
  useEffect(() => {
    setSaved(loadSaved());
    setHydrated(true);
  }, []);

  // ── Persist on change ──
  useEffect(() => {
    if (hydrated) saveAll(saved);
  }, [saved, hydrated]);

  // ── Auto-select first saved when list changes & nothing is active ──
  useEffect(() => {
    if (!activeId && saved.length > 0) setActiveId(saved[0]._id);
    if (activeId && !saved.find((m) => m._id === activeId)) {
      setActiveId(saved[0]?._id || null);
    }
  }, [saved, activeId]);

  // ── Add new mailbox: verify it's public, then save ──
  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    const email = input.toLowerCase().trim();
    if (!email) return;

    if (saved.find((m) => m.emailAddress === email)) {
      setError("Already saved");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(
        `/api/public/mailbox?email=${encodeURIComponent(email)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add mailbox");
        return;
      }
      setSaved((prev) => [
        { _id: data._id, emailAddress: data.emailAddress, savedAt: Date.now() },
        ...prev,
      ]);
      setInput("");
      setActiveId(data._id);
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (id) => {
    setSaved((prev) => prev.filter((m) => m._id !== id));
    if (selected && selected.mailboxId === id) setSelected(null);
  };

  // ── Fetch emails. silent=true skips loading flicker on background refresh. ──
  const fetchEmails = useCallback(async (mailboxId, { silent = false } = {}) => {
    if (!mailboxId) return;
    if (!silent) setEmailsLoading(true);
    try {
      const res = await fetch(`/api/public/mailbox/${mailboxId}/emails`);
      const data = await res.json();
      if (res.ok) {
        const fresh = data.emails || [];
        if (silent) {
          // Merge: keep any socket-delivered emails not yet in DB result; dedupe by _id.
          setEmails((prev) => {
            const ids = new Set(fresh.map((e) => e._id));
            const extras = prev.filter((e) => !ids.has(e._id));
            const merged = [...extras, ...fresh];
            merged.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
            return merged;
          });
        } else {
          setEmails(fresh);
        }
      } else if (!silent) {
        setEmails([]);
      }
    } catch {
      if (!silent) setEmails([]);
    } finally {
      if (!silent) setEmailsLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelected(null);
    setEmails([]);
    if (activeId) fetchEmails(activeId);
  }, [activeId, fetchEmails]);

  // ── Realtime: subscribe to socket room for active mailbox ──
  useEffect(() => {
    if (!activeId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-mailbox", activeId);
    });

    socket.on("new-email", (email) => {
      setEmails((prev) => {
        if (prev.some((e) => e._id === email._id)) return prev;
        return [{ ...email }, ...prev];
      });
      setPulse(true);
      setTimeout(() => setPulse(false), 2500);
    });

    return () => {
      socket.emit("leave-mailbox", activeId);
      socket.disconnect();
    };
  }, [activeId]);

  // ── Polling fallback every 30s (silent: no spinner, merge with socket state) ──
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => fetchEmails(activeId, { silent: true }), 30000);
    return () => clearInterval(t);
  }, [activeId, fetchEmails]);

  const active = saved.find((m) => m._id === activeId) || null;

  return (
    <section className="py-12 sm:py-16" aria-label="Public Mailboxes">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium mb-4">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          No account needed
        </div>
        <h2 className="section-title">Save a public mailbox</h2>
        <p className="section-subtitle max-w-xl mx-auto mt-3">
          Drop in a public email address and watch it receive mail in real-time.
          Your saved mailboxes stay in this browser.
        </p>
      </div>

      <div className="card p-5 sm:p-6 max-w-4xl mx-auto">
        {/* Add form */}
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <input
              type="email"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="someone@yourdomain.com"
              className="input-field !pl-9 !rounded-xl w-full"
              required
            />
          </div>
          <button
            type="submit"
            disabled={adding || !input}
            className="btn-primary text-sm whitespace-nowrap"
          >
            {adding ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Adding…
              </span>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Save Mailbox
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Saved chips */}
        {saved.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {saved.map((m) => (
              <div
                key={m._id}
                className={`group inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full border text-xs font-medium transition-all cursor-pointer ${
                  activeId === m._id
                    ? "bg-brand-50 border-brand-200 text-brand-700"
                    : "bg-white border-surface-200 text-surface-600 hover:border-surface-300"
                }`}
                onClick={() => setActiveId(m._id)}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${activeId === m._id ? "bg-brand-500" : "bg-surface-300"}`} />
                <span className="truncate max-w-[180px]">{m.emailAddress}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(m._id);
                  }}
                  className="w-5 h-5 rounded-full hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-surface-400 transition"
                  title="Remove"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Inbox view for active mailbox */}
        {active && (
          <div className="mt-6 border-t border-surface-100 pt-5">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {active.emailAddress[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-mono text-surface-800 truncate">{active.emailAddress}</p>
                  <p className="text-[11px] text-surface-400">
                    {emails.length} email{emails.length !== 1 ? "s" : ""} · live
                  </p>
                </div>
              </div>
              {pulse && (
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full animate-pulse">
                  New email!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-3">
              {/* Email list */}
              <div className="border border-surface-100 rounded-xl bg-surface-50/40 max-h-[420px] overflow-y-auto">
                {emailsLoading ? (
                  <div className="p-6 text-center text-xs text-surface-400">Loading…</div>
                ) : emails.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-xs font-medium text-surface-500 mb-1">No emails yet</p>
                    <p className="text-[11px] text-surface-400">Waiting for incoming mail…</p>
                    <div className="mt-2 flex justify-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
                    </div>
                  </div>
                ) : (
                  <ul>
                    {emails.map((em) => {
                      const sender = parseSender(em.from);
                      const isSel = selected?._id === em._id;
                      return (
                        <li
                          key={em._id}
                          onClick={() => setSelected({ ...em, mailboxId: active._id })}
                          className={`px-3 py-3 cursor-pointer border-b border-surface-100 last:border-b-0 transition-all ${
                            isSel ? "bg-brand-50/60 border-l-2 border-l-brand-500" : "hover:bg-white border-l-2 border-l-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-surface-800 truncate">
                              {em.subject || "(No Subject)"}
                            </p>
                            <span className="text-[10px] text-surface-400 shrink-0">{timeAgo(em.receivedAt)}</span>
                          </div>
                          <p className="text-[11px] text-surface-500 truncate mt-0.5">{sender.name}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Email body */}
              <div className="border border-surface-100 rounded-xl bg-white overflow-hidden">
                {selected ? (
                  <div>
                    <div className="px-4 py-3 border-b border-surface-100">
                      <p className="text-sm font-semibold text-surface-900 truncate">
                        {selected.subject || "(No Subject)"}
                      </p>
                      <p className="text-[11px] text-surface-500 truncate mt-0.5">
                        From: {parseSender(selected.from).name}
                        {parseSender(selected.from).email && (
                          <span className="text-surface-400"> &lt;{parseSender(selected.from).email}&gt;</span>
                        )}
                      </p>
                      <p className="text-[10px] text-surface-400 mt-0.5">
                        {new Date(selected.receivedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-2 max-h-[360px] overflow-y-auto">
                      {selected.bodyHtml ? (
                        <EmailHtmlFrame html={selected.bodyHtml} />
                      ) : (
                        <pre className="whitespace-pre-wrap text-xs text-surface-600 leading-relaxed font-sans p-3">
                          {selected.bodyText || "(Empty body)"}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center p-6">
                    <div className="w-12 h-12 rounded-2xl bg-surface-50 flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-surface-500">Select an email to read</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {hydrated && saved.length === 0 && (
          <div className="mt-6 px-4 py-6 bg-surface-50/60 border border-dashed border-surface-200 rounded-xl text-center">
            <p className="text-xs text-surface-500">
              No mailboxes saved yet. Add a public email above to start watching it live.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
