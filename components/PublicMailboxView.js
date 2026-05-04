"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import io from "socket.io-client";

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
  const [height, setHeight] = useState(320);

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
        const h =
          iframe.contentDocument?.documentElement?.scrollHeight ||
          iframe.contentWindow?.document?.body?.scrollHeight;
        if (h) setHeight(Math.min(Math.max(h + 32, 240), 1800));
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
      style={{ height: `${height}px`, minHeight: "240px" }}
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

export default function PublicMailboxView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mailParam = (searchParams.get("mail") || "").toLowerCase().trim();

  const [input, setInput] = useState(mailParam);
  const [mailbox, setMailbox] = useState(null);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const mailboxIdRef = useRef(null);

  // Keep input synced with URL param
  useEffect(() => {
    setInput(mailParam);
  }, [mailParam]);

  // Track active mailbox in a ref for socket handler stability
  useEffect(() => {
    mailboxIdRef.current = mailbox?._id || null;
  }, [mailbox]);

  // Verify mailbox + load emails when URL param changes
  useEffect(() => {
    let cancelled = false;

    if (!mailParam) {
      setMailbox(null);
      setEmails([]);
      setError("");
      setLoading(false);
      setSelected(null);
      setPulse(false);
      return;
    }

    setLoading(true);
    setError("");
    setMailbox(null);
    setEmails([]);
    setSelected(null);
    setPulse(false);

    (async () => {
      try {
        const verifyRes = await fetch(
          `/api/public/mailbox?email=${encodeURIComponent(mailParam)}`
        );
        const verifyData = await verifyRes.json();
        if (cancelled) return;
        if (!verifyRes.ok) {
          setError(verifyData.error || "Mailbox not available");
          setLoading(false);
          return;
        }
        setMailbox(verifyData);

        const emailsRes = await fetch(
          `/api/public/mailbox/${verifyData._id}/emails`
        );
        const emailsData = await emailsRes.json();
        if (cancelled) return;
        if (emailsRes.ok) {
          setEmails(emailsData.emails || []);
        }
      } catch {
        if (!cancelled) setError("Network error — please retry");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mailParam]);

  // Socket.io: subscribe to the active mailbox's room for realtime
  useEffect(() => {
    if (!mailbox?._id) return;
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-mailbox", mailbox._id);
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("new-email", (email) => {
      const mid = email.mailboxId?.toString();
      if (mid !== mailboxIdRef.current) return;
      setEmails((prev) => {
        if (prev.some((e) => e._id === email._id)) return prev;
        return [{ ...email }, ...prev];
      });
      setPulse(true);
      setTimeout(() => setPulse(false), 2500);
    });

    return () => {
      socket.emit("leave-mailbox", mailbox._id);
      socket.disconnect();
    };
  }, [mailbox?._id]);

  // Polling fallback: refresh every 30s, merge by _id
  useEffect(() => {
    if (!mailbox?._id) return;
    const id = mailbox._id;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/mailbox/${id}/emails`);
        if (!res.ok) return;
        const data = await res.json();
        // Stale-fetch guard
        if (id !== mailboxIdRef.current) return;
        const fresh = data.emails || [];
        setEmails((prev) => {
          const ids = new Set(fresh.map((e) => e._id));
          const extras = prev.filter((e) => !ids.has(e._id));
          const merged = [...extras, ...fresh];
          merged.sort(
            (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)
          );
          return merged;
        });
      } catch {}
    }, 30000);
    return () => clearInterval(t);
  }, [mailbox?._id]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const next = input.toLowerCase().trim();
      if (!next || next === mailParam) return;
      router.push(`/mailbox?mail=${encodeURIComponent(next)}`);
    },
    [input, mailParam, router]
  );

  const copyAddress = () => {
    if (!mailbox?.emailAddress) return;
    navigator.clipboard
      .writeText(mailbox.emailAddress)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div className="animate-fade-in py-6 sm:py-10">
      <div className="max-w-4xl mx-auto">
        {/* Header / input */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Public mailbox · no signup
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 mb-3 text-balance">
            Watch any{" "}
            <span className="gradient-text">public mailbox</span>
          </h1>
          <p className="text-sm sm:text-base text-surface-500 max-w-xl mx-auto">
            Type a public email address, hit watch, and emails arrive live.
            The address stays in the URL so you can bookmark or share it.
          </p>
        </div>

        {/* Input form (prefilled with ?mail=) */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-2 p-2 bg-white border border-surface-200 rounded-2xl shadow-soft mb-6"
        >
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <input
              type="email"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="someone@yourdomain.com"
              className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none pl-10 pr-3 py-2.5 text-sm text-surface-800 placeholder:text-surface-400"
              required
            />
          </div>
          <button
            type="submit"
            disabled={!input || input.toLowerCase().trim() === mailParam}
            className="btn-primary text-sm whitespace-nowrap rounded-xl"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Watch
          </button>
        </form>

        {/* Empty state — no ?mail= yet */}
        {!mailParam && !loading && (
          <div className="card p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-surface-600">
              Enter a public mailbox address above to start watching.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="card p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-3 animate-pulse">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-surface-500">
              Looking up <span className="font-mono">{mailParam}</span>…
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-red-700 mb-1">{error}</p>
            <p className="text-xs text-surface-500">
              Make sure the address belongs to a mailbox whose owner enabled <em>public access</em>.
            </p>
          </div>
        )}

        {/* Inbox view */}
        {mailbox && !loading && !error && (
          <div className="card overflow-hidden">
            {/* Mailbox header */}
            <div className="px-5 sm:px-6 py-4 border-b border-surface-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
                  {mailbox.emailAddress[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm sm:text-base font-mono font-semibold text-surface-900 break-all leading-tight">
                      {mailbox.emailAddress}
                    </p>
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="p-1 rounded-lg hover:bg-surface-100 transition text-surface-400 hover:text-surface-600 shrink-0"
                      title="Copy address"
                    >
                      {copied ? (
                        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {emails.length} email{emails.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {pulse && (
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full animate-pulse">
                    New email!
                  </span>
                )}
                <span
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                    connected
                      ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                      : "bg-surface-50 border-surface-100 text-surface-500"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connected ? "bg-emerald-500 animate-pulse" : "bg-surface-300"
                    }`}
                  />
                  {connected ? "Live" : "Connecting…"}
                </span>
              </div>
            </div>

            {/* Inbox split */}
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] min-h-[480px]">
              {/* Email list */}
              <div className={`border-b md:border-b-0 md:border-r border-surface-100 overflow-y-auto max-h-[480px] md:max-h-none ${selected ? 'hidden md:block' : 'block'}`}>
                {emails.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-surface-50 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-7 h-7 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
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
                    {emails.map((em) => {
                      const sender = parseSender(em.from);
                      const isSel = selected?._id === em._id;
                      return (
                        <li
                          key={em._id}
                          onClick={() => setSelected(em)}
                          className={`px-4 py-3 cursor-pointer border-b border-surface-50 last:border-b-0 transition-all ${
                            isSel
                              ? "bg-brand-50/60 border-l-[3px] border-l-brand-500"
                              : "hover:bg-surface-50 border-l-[3px] border-l-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-surface-800 truncate">
                              {em.subject || "(No Subject)"}
                            </p>
                            <span className="text-[10px] text-surface-400 shrink-0">
                              {timeAgo(em.receivedAt)}
                            </span>
                          </div>
                          <p className="text-xs text-surface-500 truncate mt-0.5">
                            {sender.name}
                            {sender.email && (
                              <span className="text-surface-400"> &lt;{sender.email}&gt;</span>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Email detail */}
              <div className={`overflow-y-auto max-h-[480px] md:max-h-none ${!selected ? 'hidden md:block' : 'block'}`}>
                {selected ? (
                  <div className="animate-fade-in">
                    <div className="sticky top-0 z-10 bg-white flex items-center gap-3 px-5 py-3 border-b border-surface-100 md:hidden">
                      <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="text-sm font-semibold text-surface-600">Back to Inbox</span>
                    </div>
                    <div className="px-5 py-4 border-b border-surface-100">
                      <h2 className="text-base font-bold text-surface-900 mb-2 leading-tight">
                        {selected.subject || "(No Subject)"}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-surface-700 break-all">
                          <span className="text-surface-400 uppercase tracking-wider mr-1">From</span>
                          <span className="font-medium">{parseSender(selected.from).name}</span>
                          {parseSender(selected.from).email && (
                            <span className="text-surface-400 ml-1">
                              &lt;{parseSender(selected.from).email}&gt;
                            </span>
                          )}
                        </span>
                        <span className="text-surface-700 break-all">
                          <span className="text-surface-400 uppercase tracking-wider mr-1">To</span>
                          {selected.to}
                        </span>
                      </div>
                      <p className="text-[11px] text-surface-400 mt-1.5">
                        {new Date(selected.receivedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4">
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
                  <div className="flex flex-col items-center justify-center h-full text-center p-10">
                    <div className="w-14 h-14 rounded-2xl bg-surface-50 flex items-center justify-center mb-3">
                      <svg className="w-7 h-7 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-surface-500">
                      {emails.length === 0 ? "Waiting for first email…" : "Pick an email to read"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
