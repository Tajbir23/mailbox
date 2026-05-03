"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
import { usePublicMailboxes } from "./usePublicMailboxes";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

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

export default function PublicMailboxInbox() {
  const { list: saved, hydrated, update } = usePublicMailboxes();
  const [activeId, setActiveId] = useState(null);
  const [emails, setEmails] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [unread, setUnread] = useState({}); // { [mailboxId]: count }
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const joinedRef = useRef(new Set());
  const activeIdRef = useRef(null);

  // Keep latest activeId in a ref so socket handlers always see the current value
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Auto-select first when nothing active or active was removed
  useEffect(() => {
    if (!activeId && saved.length > 0) setActiveId(saved[0]._id);
    if (activeId && !saved.find((m) => m._id === activeId)) {
      setActiveId(saved[0]?._id || null);
    }
  }, [saved, activeId]);

  // Clear unread badge when user opens a mailbox
  useEffect(() => {
    if (activeId && unread[activeId]) {
      setUnread((prev) => {
        const next = { ...prev };
        delete next[activeId];
        return next;
      });
    }
  }, [activeId, unread]);

  const handleRemove = (id) => {
    update((prev) => prev.filter((m) => m._id !== id));
    if (selected && selected.mailboxId === id) setSelected(null);
    setUnread((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const fetchEmails = useCallback(async (mailboxId, { silent = false } = {}) => {
    if (!mailboxId) return;
    if (!silent) setEmailsLoading(true);
    try {
      const res = await fetch(`/api/public/mailbox/${mailboxId}/emails`);
      const data = await res.json();
      if (res.ok) {
        const fresh = data.emails || [];
        // Update lastSeen even if the user has switched away — keeps cursor accurate.
        if (fresh[0]) {
          try {
            localStorage.setItem(
              `mailboxsaas:lastSeen:${mailboxId}`,
              fresh[0]._id
            );
          } catch {}
        }
        // Stale-fetch guard: only mutate visible emails state if user
        // hasn't switched to a different mailbox while we were waiting.
        if (mailboxId === activeIdRef.current) {
          // Always merge by _id so a socket-delivered email that arrived
          // between setEmails([]) and this resolve isn't overwritten.
          setEmails((prev) => {
            const ids = new Set(fresh.map((e) => e._id));
            const extras = prev.filter((e) => !ids.has(e._id));
            const merged = [...extras, ...fresh];
            merged.sort(
              (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)
            );
            return merged;
          });
        }
      } else if (!silent && mailboxId === activeIdRef.current) {
        setEmails([]);
      }
    } catch {
      if (!silent && mailboxId === activeIdRef.current) setEmails([]);
    } finally {
      if (!silent) setEmailsLoading(false);
    }
  }, []);

  // Switching active mailbox: load its emails
  useEffect(() => {
    setSelected(null);
    setEmails([]);
    if (activeId) fetchEmails(activeId);
  }, [activeId, fetchEmails]);

  // ── Single socket: subscribe to ALL saved mailboxes; route by mailboxId ──
  useEffect(() => {
    if (saved.length === 0) {
      // Tear down if no mailboxes saved
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        joinedRef.current = new Set();
        setConnected(false);
      }
      return;
    }

    // Create the socket once
    if (!socketRef.current) {
      const socket = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        // Re-join all desired rooms on (re)connect
        for (const id of joinedRef.current) {
          socket.emit("join-mailbox", id);
        }
      });

      socket.on("disconnect", () => setConnected(false));

      socket.on("new-email", (email) => {
        const mid = email.mailboxId?.toString();
        if (!mid) return;

        if (mid === activeIdRef.current) {
          // Active mailbox: append to visible list
          setEmails((prev) => {
            if (prev.some((e) => e._id === email._id)) return prev;
            return [{ ...email }, ...prev];
          });
          // User is looking at this mailbox: mark as seen
          try {
            localStorage.setItem(`mailboxsaas:lastSeen:${mid}`, email._id);
          } catch {}
          setPulse(true);
          setTimeout(() => setPulse(false), 2500);
        } else {
          // Background mailbox: bump unread badge on its chip,
          // and advance lastSeen so polling fallback won't double-count it.
          setUnread((prev) => ({ ...prev, [mid]: (prev[mid] || 0) + 1 }));
          try {
            localStorage.setItem(`mailboxsaas:lastSeen:${mid}`, email._id);
          } catch {}
        }
      });
    }

    // Sync joined rooms with current saved list
    const socket = socketRef.current;
    const wanted = new Set(saved.map((m) => m._id));

    for (const id of Array.from(joinedRef.current)) {
      if (!wanted.has(id)) {
        socket.emit("leave-mailbox", id);
        joinedRef.current.delete(id);
      }
    }
    for (const id of wanted) {
      if (!joinedRef.current.has(id)) {
        if (socket.connected) socket.emit("join-mailbox", id);
        joinedRef.current.add(id);
      }
    }
  }, [saved]);

  // Disconnect socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // ── Polling fallback: refresh active mailbox every 30s (silent) ──
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(
      () => fetchEmails(activeId, { silent: true }),
      30000
    );
    return () => clearInterval(t);
  }, [activeId, fetchEmails]);

  // ── Polling fallback for background mailboxes: every 60s, check for new mail ──
  // Catches emails missed during a socket disconnect.
  useEffect(() => {
    if (saved.length <= 1) return;
    const t = setInterval(async () => {
      const others = saved.filter((m) => m._id !== activeIdRef.current);
      for (const m of others) {
        try {
          const res = await fetch(
            `/api/public/mailbox/${m._id}/emails?limit=10`
          );
          if (!res.ok) continue;
          const data = await res.json();
          const latest = data.emails?.[0];
          if (!latest) continue;

          const seenKey = `mailboxsaas:lastSeen:${m._id}`;
          const lastSeen = localStorage.getItem(seenKey);

          if (!lastSeen) {
            // First poll: establish baseline only.
            localStorage.setItem(seenKey, latest._id);
            continue;
          }
          if (lastSeen === latest._id) continue;

          const idx = data.emails.findIndex((e) => e._id === lastSeen);
          if (idx === -1) {
            // lastSeen not in window — either a socket race already updated it,
            // or it predates our window. Don't bump or regress.
            continue;
          }
          if (idx > 0) {
            setUnread((prev) => ({
              ...prev,
              [m._id]: (prev[m._id] || 0) + idx,
            }));
            localStorage.setItem(seenKey, latest._id);
          }
        } catch {}
      }
    }, 60000);
    return () => clearInterval(t);
  }, [saved]);

  const active = saved.find((m) => m._id === activeId) || null;

  if (!hydrated) return null;
  if (saved.length === 0) return null;

  return (
    <section className="py-10 sm:py-14" aria-label="Your saved mailboxes">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-surface-800">
              Your saved mailboxes
            </h2>
            <p className="text-xs text-surface-500 mt-1">
              Live updates from public mailboxes you&apos;re watching.
            </p>
          </div>
          <span
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
              connected
                ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                : "bg-surface-50 border-surface-100 text-surface-500"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-surface-300"
              }`}
            />
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>

        <div className="card p-5 sm:p-6">
          {/* Saved chips with unread badges */}
          <div className="flex flex-wrap gap-2">
            {saved.map((m) => {
              const count = unread[m._id] || 0;
              const isActive = activeId === m._id;
              return (
                <div
                  key={m._id}
                  className={`group inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full border text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-white border-surface-200 text-surface-600 hover:border-surface-300"
                  }`}
                  onClick={() => setActiveId(m._id)}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? "bg-brand-500" : "bg-surface-300"
                    }`}
                  />
                  <span className="truncate max-w-[180px]">
                    {m.emailAddress}
                  </span>
                  {count > 0 && !isActive && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(m._id);
                    }}
                    className="w-5 h-5 rounded-full hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-surface-400 transition"
                    title="Remove"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {active && (
            <div className="mt-6 border-t border-surface-100 pt-5">
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {active.emailAddress[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-surface-800 truncate">
                      {active.emailAddress}
                    </p>
                    <p className="text-[11px] text-surface-400">
                      {emails.length} email{emails.length !== 1 ? "s" : ""} ·{" "}
                      {connected ? "live" : "reconnecting"}
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
                <div className="border border-surface-100 rounded-xl bg-surface-50/40 max-h-[420px] overflow-y-auto">
                  {emailsLoading ? (
                    <div className="p-6 text-center text-xs text-surface-400">
                      Loading…
                    </div>
                  ) : emails.length === 0 ? (
                    <div className="p-6 text-center">
                      <p className="text-xs font-medium text-surface-500 mb-1">
                        No emails yet
                      </p>
                      <p className="text-[11px] text-surface-400">
                        Waiting for incoming mail…
                      </p>
                      <div className="mt-2 flex justify-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                        <div
                          className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"
                          style={{ animationDelay: "0.2s" }}
                        />
                        <div
                          className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"
                          style={{ animationDelay: "0.4s" }}
                        />
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
                            onClick={() =>
                              setSelected({ ...em, mailboxId: active._id })
                            }
                            className={`px-3 py-3 cursor-pointer border-b border-surface-100 last:border-b-0 transition-all ${
                              isSel
                                ? "bg-brand-50/60 border-l-2 border-l-brand-500"
                                : "hover:bg-white border-l-2 border-l-transparent"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-surface-800 truncate">
                                {em.subject || "(No Subject)"}
                              </p>
                              <span className="text-[10px] text-surface-400 shrink-0">
                                {timeAgo(em.receivedAt)}
                              </span>
                            </div>
                            <p className="text-[11px] text-surface-500 truncate mt-0.5">
                              {sender.name}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

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
                            <span className="text-surface-400">
                              {" "}
                              &lt;{parseSender(selected.from).email}&gt;
                            </span>
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
                        <svg
                          className="w-6 h-6 text-surface-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold text-surface-500">
                        Select an email to read
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
