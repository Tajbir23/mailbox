"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

// ── Sanitize HTML email: strip scripts/event handlers but preserve styles ──
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

// ── Sandboxed iframe renderer for HTML emails with full CSS support ──
function EmailHtmlFrame({ html }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    if (!iframeRef.current || !html) return;
    const sanitized = sanitizeHtml(html);
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;word-wrap:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto}a{color:#6366f1}table{max-width:100%!important;width:auto!important}pre{white-space:pre-wrap;overflow-x:auto}</style></head><body>${sanitized}</body></html>`;
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;

    const iframe = iframeRef.current;
    const handleLoad = () => {
      try {
        const h = iframe.contentDocument?.documentElement?.scrollHeight || iframe.contentWindow?.document?.body?.scrollHeight;
        if (h) setHeight(Math.min(Math.max(h + 32, 200), 2000));
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

function senderInitial(from) {
  const { name } = parseSender(from);
  return (name[0] || "?").toUpperCase();
}

export default function InboxView({ mailboxId }) {
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newEmailAlert, setNewEmailAlert] = useState(false);
  const socketRef = useRef(null);
  const pollRef = useRef(null);

  // Fetch emails
  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch(`/api/mailboxes/${mailboxId}/emails`);
      const data = await res.json();
      setEmails(data.emails || []);
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    }
  }, [mailboxId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchEmails().finally(() => setLoading(false));
  }, [fetchEmails]);

  // Mark email as read
  const markAsRead = useCallback(
    async (emailId) => {
      try {
        await fetch(`/api/mailboxes/${mailboxId}/emails/read`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailIds: [emailId] }),
        });
        setEmails((prev) =>
          prev.map((e) => (e._id === emailId ? { ...e, isRead: true } : e))
        );
      } catch (err) {
        console.error("Failed to mark as read:", err);
      }
    },
    [mailboxId]
  );

  // Select email and mark as read
  const handleSelectEmail = useCallback(
    (email) => {
      setSelected(email);
      if (!email.isRead) {
        markAsRead(email._id);
      }
    },
    [markAsRead]
  );

  // Socket.io real-time listener
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-mailbox", mailboxId);
    });

    socket.on("new-email", (email) => {
      setEmails((prev) => [{ ...email, isRead: false }, ...prev]);
      setNewEmailAlert(true);
      setTimeout(() => setNewEmailAlert(false), 3000);
    });

    return () => {
      socket.emit("leave-mailbox", mailboxId);
      socket.disconnect();
    };
  }, [mailboxId]);

  // Fallback polling every 30s (in case Socket.io disconnects)
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchEmails();
    }, 30000);

    return () => clearInterval(pollRef.current);
  }, [fetchEmails]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const unreadIds = emails.filter((e) => !e.isRead).map((e) => e._id);
    if (unreadIds.length === 0) return;
    try {
      await fetch(`/api/mailboxes/${mailboxId}/emails/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: unreadIds }),
      });
      setEmails((prev) => prev.map((e) => ({ ...e, isRead: true })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [emails, mailboxId]);

  const unreadCount = emails.filter((e) => !e.isRead).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* New email notification toast */}
      {newEmailAlert && (
        <div className="mb-3 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200/60 rounded-2xl text-green-700 text-sm flex items-center gap-3 animate-slide-up shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <span className="font-medium">New email received!</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 card overflow-hidden">
        {/* Email list sidebar */}
        <div className="w-full md:w-[340px] lg:w-[380px] border-b md:border-b-0 md:border-r border-surface-100 overflow-y-auto shrink-0 max-h-[40vh] md:max-h-none">
          {/* Header with unread count */}
          <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
              </div>
              <span className="text-sm font-semibold text-surface-800">Inbox</span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-xs font-bold text-white bg-gradient-to-r from-red-500 to-rose-500 rounded-full shadow-sm">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold hover:bg-brand-50 px-2.5 py-1.5 rounded-lg transition-all"
              >
                Mark all read
              </button>
            )}
          </div>

          {emails.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
              </div>
              <p className="text-sm font-medium text-surface-500 mb-1">No emails yet</p>
              <p className="text-xs text-surface-400">Waiting for incoming mail…</p>
              <div className="mt-3 flex justify-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
              </div>
            </div>
          ) : (
            <ul>
              {emails.map((email) => (
                <li
                  key={email._id}
                  onClick={() => handleSelectEmail(email)}
                  className={`px-5 py-4 cursor-pointer transition-all relative group border-b border-surface-50 ${
                    selected?._id === email._id
                      ? "bg-brand-50/60 border-l-[3px] border-l-brand-500"
                      : "hover:bg-surface-50 border-l-[3px] border-l-transparent"
                  } ${!email.isRead ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex gap-3">
                    {/* Sender avatar */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                      !email.isRead
                        ? "bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-brand-sm"
                        : "bg-surface-100 text-surface-500"
                    }`}>
                      {senderInitial(email.from)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${
                          !email.isRead
                            ? "font-semibold text-surface-900"
                            : "font-medium text-surface-600"
                        }`}>
                          {email.subject || "(No Subject)"}
                        </p>
                        {!email.isRead && (
                          <span className="w-2 h-2 bg-brand-500 rounded-full shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-surface-500 truncate mt-0.5">
                        {parseSender(email.from).name}
                        {parseSender(email.from).email && (
                          <span className="text-surface-400"> &lt;{parseSender(email.from).email}&gt;</span>
                        )}
                      </p>
                      <p className="text-[11px] text-surface-400 mt-1">
                        {timeAgo(email.receivedAt)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Email detail view */}
        <div className="flex-1 overflow-y-auto min-w-0 bg-white">
          {selected ? (
            <div className="animate-fade-in">
              {/* Email header */}
              <div className="px-6 py-5 border-b border-surface-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shrink-0 text-white font-bold text-lg shadow-brand-sm">
                    {senderInitial(selected.from)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-surface-900 mb-2 leading-tight">
                      {selected.subject || "(No Subject)"}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="text-surface-700 break-all">
                        <span className="text-surface-400 text-xs uppercase tracking-wider mr-1">From</span>
                        <span className="font-medium">{parseSender(selected.from).name}</span>
                        {parseSender(selected.from).email && (
                          <span className="text-surface-400 text-xs ml-1">&lt;{parseSender(selected.from).email}&gt;</span>
                        )}
                      </span>
                      <span className="text-surface-700 break-all">
                        <span className="text-surface-400 text-xs uppercase tracking-wider mr-1">To</span>
                        {selected.to}
                      </span>
                    </div>
                    <p className="text-xs text-surface-400 mt-1.5">
                      {new Date(selected.receivedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Email body */}
              <div className="p-6">
                {selected.bodyHtml ? (
                  <EmailHtmlFrame html={selected.bodyHtml} />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-surface-600 leading-relaxed font-sans">
                    {selected.bodyText || "(Empty body)"}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-20 h-20 rounded-3xl bg-surface-50 flex items-center justify-center mb-5">
                <svg className="w-10 h-10 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <p className="text-base font-semibold text-surface-500 mb-1">No email selected</p>
              <p className="text-sm text-surface-400">Choose an email from the list to read it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
