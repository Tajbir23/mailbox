"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import io from "socket.io-client";
import { useToast } from "@/components/Toast";
import { makeMatcher } from "@/lib/search";
import EmailTagModal from "@/components/EmailTagModal";
import EmailCommentModal from "@/components/EmailCommentModal";
import Compose from "@/components/Compose";

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

// ── Reply/Forward prefill helpers ───────────────────────────────────────────
// Client-side prefill only — the server authoritatively re-derives subject,
// body, and attachments from the source email (Req 6.x / 7.x).

// Add a "Re: " / "Fwd: " prefix once (case-insensitive), skipping if already present.
function prefixSubject(subject, prefix) {
  const s = (subject || "").trim();
  if (!s) return prefix.trim();
  const re = new RegExp(`^${prefix.trim()}`, "i");
  return re.test(s) ? s : `${prefix}${s}`;
}

// Build a quoted body for forwarding, mirroring the conventional forward header.
function buildForwardBody(email) {
  const header =
    "\n\n---------- Forwarded message ----------\n" +
    `From: ${email.from || ""}\n` +
    (email.to ? `To: ${email.to}\n` : "") +
    `Subject: ${email.subject || "(No Subject)"}\n` +
    (email.receivedAt ? `Date: ${new Date(email.receivedAt).toLocaleString()}\n` : "") +
    "\n";
  return header + (email.bodyText || "");
}

export default function InboxView({ mailboxId, isOwner = false, currentUserId = null }) {
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newEmailAlert, setNewEmailAlert] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [tagManageEmail, setTagManageEmail] = useState(null);
  const [commentManageEmail, setCommentManageEmail] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState(null);
  const socketRef = useRef(null);
  const pollRef = useRef(null);
  const toast = useToast();

  const toggleSelect = useCallback((emailId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

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

    // Terminal send status for messages composed from this mailbox (Req 10.2).
    socket.on("email-status", (status) => {
      if (!status) return;
      const subj = status.subject || "(No Subject)";
      if (status.deliveryStatus === "sent") {
        toast.success(`Message sent: ${subj}`);
      } else if (status.deliveryStatus === "failed") {
        toast.error(
          status.failureReason
            ? `Failed to send "${subj}": ${status.failureReason}`
            : `Failed to send "${subj}"`
        );
      }
    });

    return () => {
      socket.emit("leave-mailbox", mailboxId);
      socket.disconnect();
    };
  }, [mailboxId, toast]);

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

  // Remove emails. Owner → permanent delete for everyone.
  // Shared user → hide from their own inbox only. Accepts one id or many.
  const deleteEmails = useCallback(
    async (ids) => {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (list.length === 0 || deleting) return;
      const noun = list.length > 1 ? `these ${list.length} emails` : "this email";
      const ok = await toast.confirm({
        title: isOwner ? "Delete permanently?" : "Remove from your inbox?",
        message: isOwner
          ? `Permanently delete ${noun} for everyone? This cannot be undone.`
          : `Remove ${noun} from your inbox? Other users with access will still see ${list.length > 1 ? "them" : "it"}.`,
        confirmText: isOwner ? "Delete" : "Remove",
        danger: true,
      });
      if (!ok) return;
      setDeleting(true);
      try {
        const res = await fetch(`/api/mailboxes/${mailboxId}/emails`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailIds: list }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to delete email");
          return;
        }
        const removed = new Set(list);
        setEmails((prev) => prev.filter((e) => !removed.has(e._id)));
        setSelected((cur) => (cur && removed.has(cur._id) ? null : cur));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of list) next.delete(id);
          return next;
        });
        toast.success(isOwner ? `${list.length} email${list.length > 1 ? "s" : ""} deleted` : "Removed from your inbox");
      } catch (err) {
        console.error("Failed to delete email:", err);
        toast.error("Failed to delete email");
      } finally {
        setDeleting(false);
      }
    },
    [mailboxId, deleting, isOwner, toast]
  );

  // Keep `selected` in sync when its underlying email is mutated (tags/comments/etc.)
  useEffect(() => {
    if (!selected) return;
    const fresh = emails.find((e) => e._id === selected._id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [emails, selected]);


  // Filter by search term — regex (case-insensitive); falls back to literal substring on invalid pattern.
  // Matches subject, from, body text, and tags.
  const filteredEmails = useMemo(() => {
    if (!search.trim()) return emails;
    const match = makeMatcher(search);
    return emails.filter((e) => match(e.subject, e.from, e.bodyText, e.tags));
  }, [emails, search]);

  // Update a specific email in local state (used by Tag/Comment modals)
  const updateEmailLocally = useCallback((emailId, patch) => {
    setEmails((prev) =>
      prev.map((e) => (e._id === emailId ? { ...e, ...patch } : e))
    );
  }, []);

  // ── Compose / Reply / Forward entry points ────────────────────────────────
  const openCompose = useCallback(() => {
    setComposeInitial({ mode: "new" });
    setComposeOpen(true);
  }, []);

  // Reply prefill: To = original sender address, subject "Re: …" (Req 6.1–6.3).
  const openReply = useCallback((email) => {
    if (!email) return;
    const sender = parseSender(email.from).email;
    setComposeInitial({
      mode: "reply",
      sourceEmailId: email._id,
      to: sender ? [sender] : [],
      subject: prefixSubject(email.subject, "Re: "),
    });
    setComposeOpen(true);
  }, []);

  // Forward prefill: subject "Fwd: …" + quoted body (Req 7.1–7.3). The server
  // authoritatively re-derives body + attachment buffers from the source email.
  const openForward = useCallback((email) => {
    if (!email) return;
    setComposeInitial({
      mode: "forward",
      sourceEmailId: email._id,
      subject: prefixSubject(email.subject, "Fwd: "),
      bodyText: buildForwardBody(email),
    });
    setComposeOpen(true);
  }, []);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeInitial(null);
  }, []);

  // Close per-row menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const onClick = (e) => {
      if (!e.target.closest("[data-row-menu]")) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [openMenuId]);

  // If the row whose menu is open gets filtered out by search, close the menu
  // so it doesn't unexpectedly reappear when the user clears the filter.
  useEffect(() => {
    if (!openMenuId) return;
    if (!filteredEmails.some((e) => e._id === openMenuId)) setOpenMenuId(null);
  }, [filteredEmails, openMenuId]);

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
          {/* Header — switches to a bulk action bar when emails are selected */}
          <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-sm z-10">
            {selectedIds.size > 0 ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={clearSelection}
                    title="Clear selection"
                    className="w-8 h-8 rounded-xl bg-surface-100 hover:bg-surface-200 flex items-center justify-center text-surface-500 hover:text-surface-700 transition-all shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <span className="text-sm font-semibold text-surface-800 truncate">
                    {selectedIds.size} selected
                  </span>
                </div>
                <button
                  onClick={() => deleteEmails(Array.from(selectedIds))}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                  {deleting ? (isOwner ? "Deleting…" : "Removing…") : isOwner ? "Delete" : "Remove"}
                </button>
              </>
            ) : (
              <>
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-brand-600 hover:text-brand-700 font-semibold hover:bg-brand-50 px-2.5 py-1.5 rounded-lg transition-all"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={openCompose}
                    title="Compose new message"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 px-2.5 py-1.5 rounded-lg shadow-brand-sm transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Compose
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Search bar — matches subject, sender, body and tags */}
          <div className="px-5 py-3 border-b border-surface-100 bg-white sticky top-[65px] z-10">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emails or tags… (regex supported)"
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-surface-50 border border-surface-100 focus:bg-white focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  title="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
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
          ) : filteredEmails.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-surface-500">No matches</p>
              <p className="text-xs text-surface-400 mt-1">Try a different search term</p>
            </div>
          ) : (
            <ul>
              {filteredEmails.map((email) => {
                const isChecked = selectedIds.has(email._id);
                const inSelectionMode = selectedIds.size > 0;
                return (
                <li
                  key={email._id}
                  onClick={() => {
                    if (inSelectionMode) toggleSelect(email._id);
                    else handleSelectEmail(email);
                  }}
                  className={`px-5 py-4 cursor-pointer transition-all relative group border-b border-surface-50 ${
                    isChecked
                      ? "bg-red-50/40 border-l-[3px] border-l-red-400"
                      : selected?._id === email._id
                      ? "bg-brand-50/60 border-l-[3px] border-l-brand-500"
                      : "hover:bg-surface-50 border-l-[3px] border-l-transparent"
                  } ${!email.isRead && !isChecked ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex gap-3">
                    {/* Avatar / checkbox — checkbox replaces avatar on hover or in selection mode */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(email._id);
                      }}
                      title={isChecked ? "Deselect" : "Select"}
                      className={`relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                        !email.isRead
                          ? "bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-brand-sm"
                          : "bg-surface-100 text-surface-500"
                      }`}
                    >
                      <span className={`${inSelectionMode || isChecked ? "opacity-0" : "group-hover:opacity-0"} transition-opacity`}>
                        {senderInitial(email.from)}
                      </span>
                      <span
                        className={`absolute inset-0 flex items-center justify-center rounded-xl border transition-all ${
                          isChecked
                            ? "bg-red-500 border-red-500 text-white opacity-100"
                            : `bg-white border-surface-300 text-transparent ${
                                inSelectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </span>
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
                      {email.tags && email.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {email.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-red-700 bg-red-100 border border-red-200 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {email.comments && email.comments.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-surface-400">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          {email.comments.length} comment{email.comments.length !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>

                    {/* Per-email actions menu */}
                    <div data-row-menu className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId((cur) => (cur === email._id ? null : email._id));
                        }}
                        title="More actions"
                        className={`p-1.5 rounded-lg transition-all text-surface-400 hover:text-surface-700 hover:bg-surface-100 ${
                          openMenuId === email._id
                            ? "bg-surface-100 text-surface-700 opacity-100"
                            : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      {openMenuId === email._id && (
                        <div className="absolute right-0 top-9 z-20 w-48 card shadow-soft-lg overflow-hidden animate-scale-in">
                          <div className="p-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                setTagManageEmail(email);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-lg flex items-center gap-2.5 transition-colors"
                            >
                              <div className="w-7 h-7 rounded-md bg-red-50 flex items-center justify-center shrink-0">
                                <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                              </div>
                              <span className="font-medium">Manage Tags</span>
                              {email.tags && email.tags.length > 0 && (
                                <span className="ml-auto text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                                  {email.tags.length}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                setCommentManageEmail(email);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-lg flex items-center gap-2.5 transition-colors"
                            >
                              <div className="w-7 h-7 rounded-md bg-brand-50 flex items-center justify-center shrink-0">
                                <svg className="w-3.5 h-3.5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                              </div>
                              <span className="font-medium">Manage Comments</span>
                              {email.comments && email.comments.length > 0 && (
                                <span className="ml-auto text-[10px] font-bold text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded">
                                  {email.comments.length}
                                </span>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
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
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h2 className="text-lg font-bold text-surface-900 leading-tight">
                        {selected.subject || "(No Subject)"}
                      </h2>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openReply(selected)}
                          title="Reply"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-white hover:bg-brand-500 border border-brand-200 hover:border-brand-500 px-2.5 py-1.5 rounded-lg transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                          Reply
                        </button>
                        <button
                          onClick={() => openForward(selected)}
                          title="Forward"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-white hover:bg-brand-500 border border-brand-200 hover:border-brand-500 px-2.5 py-1.5 rounded-lg transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg>
                          Forward
                        </button>
                        <button
                          onClick={() => deleteEmails(selected._id)}
                          disabled={deleting}
                          title={isOwner ? "Delete for everyone" : "Remove from your inbox"}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                          {deleting ? (isOwner ? "Deleting…" : "Removing…") : isOwner ? "Delete" : "Remove"}
                        </button>
                      </div>
                    </div>
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

      <EmailTagModal
        email={tagManageEmail}
        mailboxId={mailboxId}
        onClose={() => setTagManageEmail(null)}
        onUpdated={updateEmailLocally}
      />
      <EmailCommentModal
        email={commentManageEmail}
        mailboxId={mailboxId}
        currentUserId={currentUserId}
        isOwner={isOwner}
        onClose={() => setCommentManageEmail(null)}
        onUpdated={updateEmailLocally}
      />

      <Compose
        mailboxId={mailboxId}
        open={composeOpen}
        onClose={closeCompose}
        initial={composeInitial}
      />
    </div>
  );
}
