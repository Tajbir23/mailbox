"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
import { useToast } from "@/components/Toast";

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

export default function InboxView({ mailboxId, isOwner = false, currentUserId = null }) {
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newEmailAlert, setNewEmailAlert] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
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

  // Reset comment panel when switching emails
  useEffect(() => {
    setShowComments(false);
    setCommentInput("");
    setTagInput("");
  }, [selected?._id]);

  // Filter by search term — matches subject, from, body text, and tags
  const filteredEmails = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) => {
      const inSubject = (e.subject || "").toLowerCase().includes(q);
      const inFrom = (e.from || "").toLowerCase().includes(q);
      const inBody = (e.bodyText || "").toLowerCase().includes(q);
      const inTags = (e.tags || []).some((t) => t.toLowerCase().includes(q));
      return inSubject || inFrom || inBody || inTags;
    });
  })();

  // ── Tag mutations ──
  const updateEmailLocally = useCallback((emailId, patch) => {
    setEmails((prev) =>
      prev.map((e) => (e._id === emailId ? { ...e, ...patch } : e))
    );
  }, []);

  const persistTags = useCallback(
    async (emailId, tags) => {
      setTagBusy(true);
      try {
        const res = await fetch(`/api/mailboxes/${mailboxId}/emails/${emailId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setTags", tags }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        updateEmailLocally(emailId, { tags: data.tags });
      } catch (err) {
        console.error(err);
        toast.error(err.message || "Failed to update tags");
      } finally {
        setTagBusy(false);
      }
    },
    [mailboxId, updateEmailLocally, toast]
  );

  const handleAddTag = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!selected) return;
      const raw = tagInput.trim();
      if (!raw) return;
      const current = selected.tags || [];
      if (current.some((t) => t.toLowerCase() === raw.toLowerCase())) {
        setTagInput("");
        return;
      }
      setTagInput("");
      await persistTags(selected._id, [...current, raw]);
    },
    [selected, tagInput, persistTags]
  );

  const handleRemoveTag = useCallback(
    async (tag) => {
      if (!selected) return;
      const next = (selected.tags || []).filter((t) => t !== tag);
      await persistTags(selected._id, next);
    },
    [selected, persistTags]
  );

  const handleEditTag = useCallback(
    async (oldTag) => {
      if (!selected) return;
      const next = await toast.prompt({
        title: "Edit tag",
        defaultValue: oldTag,
        confirmText: "Save",
        placeholder: "Tag name",
      });
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === oldTag) return;
      const tags = (selected.tags || [])
        .map((t) => (t === oldTag ? trimmed : t))
        .filter((t, i, arr) => arr.indexOf(t) === i);
      await persistTags(selected._id, tags);
    },
    [selected, persistTags, toast]
  );

  // ── Comment mutations ──
  const handleAddComment = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!selected) return;
      const text = commentInput.trim();
      if (!text) return;
      setCommentBusy(true);
      try {
        const res = await fetch(
          `/api/mailboxes/${mailboxId}/emails/${selected._id}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        const nextComments = [...(selected.comments || []), data.comment];
        updateEmailLocally(selected._id, { comments: nextComments });
        setCommentInput("");
      } catch (err) {
        console.error(err);
        toast.error(err.message || "Failed to add comment");
      } finally {
        setCommentBusy(false);
      }
    },
    [selected, commentInput, mailboxId, updateEmailLocally, toast]
  );

  const handleDeleteComment = useCallback(
    async (commentId) => {
      if (!selected) return;
      const ok = await toast.confirm({
        title: "Delete comment?",
        message: "This comment will be removed for everyone.",
        confirmText: "Delete",
        danger: true,
      });
      if (!ok) return;
      try {
        const res = await fetch(
          `/api/mailboxes/${mailboxId}/emails/${selected._id}/comments?commentId=${commentId}`,
          { method: "DELETE" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed");
        const nextComments = (selected.comments || []).filter(
          (c) => String(c._id) !== String(commentId)
        );
        updateEmailLocally(selected._id, { comments: nextComments });
      } catch (err) {
        console.error(err);
        toast.error(err.message || "Failed to delete comment");
      }
    },
    [selected, mailboxId, updateEmailLocally, toast]
  );

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
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold hover:bg-brand-50 px-2.5 py-1.5 rounded-lg transition-all"
                  >
                    Mark all read
                  </button>
                )}
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
                placeholder="Search emails or tags…"
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
                      <button
                        onClick={() => deleteEmails(selected._id)}
                        disabled={deleting}
                        title={isOwner ? "Delete for everyone" : "Remove from your inbox"}
                        className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                        {deleting ? (isOwner ? "Deleting…" : "Removing…") : isOwner ? "Delete" : "Remove"}
                      </button>
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

              {/* Tags + Comments toolbar */}
              <div className="px-6 py-3 border-b border-surface-100 bg-surface-50/40">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center flex-wrap gap-1.5 min-w-0 flex-1">
                    <span className="text-[10px] uppercase tracking-wider text-surface-400 font-semibold mr-1">Tags</span>
                    {(selected.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-semibold text-red-700 bg-red-100 border border-red-200 rounded-md group/tag"
                      >
                        <button
                          onClick={() => handleEditTag(tag)}
                          disabled={tagBusy}
                          title="Edit tag"
                          className="hover:underline disabled:opacity-50"
                        >
                          {tag}
                        </button>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          disabled={tagBusy}
                          title="Remove tag"
                          className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-200 text-red-500 hover:text-red-700 disabled:opacity-50 transition"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                    <form onSubmit={handleAddTag} className="inline-flex items-center">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="+ Add tag"
                        disabled={tagBusy}
                        maxLength={40}
                        className="px-2 py-0.5 text-xs bg-white border border-dashed border-surface-300 hover:border-red-300 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 rounded-md w-28 transition disabled:opacity-50"
                      />
                    </form>
                  </div>
                  <button
                    onClick={() => setShowComments((v) => !v)}
                    className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      showComments
                        ? "bg-brand-500 text-white border-brand-500"
                        : "text-surface-700 bg-white hover:bg-surface-50 border-surface-200"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    Comments
                    {selected.comments && selected.comments.length > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full ${showComments ? "bg-white/25 text-white" : "bg-brand-100 text-brand-700"}`}>
                        {selected.comments.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Comments panel — hidden by default; toggled by the Comments button */}
              {showComments && (
                <div className="px-6 py-4 border-b border-surface-100 bg-amber-50/30 animate-fade-in">
                  <ul className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                    {(selected.comments || []).length === 0 ? (
                      <li className="text-xs text-surface-400 italic">No comments yet — be the first to add one.</li>
                    ) : (
                      selected.comments.map((c) => {
                        const cid = String(c._id);
                        const canDelete =
                          isOwner || (currentUserId && String(c.userId) === String(currentUserId));
                        return (
                          <li key={cid} className="bg-white border border-amber-100 rounded-xl px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-surface-800 truncate">{c.userName || "User"}</span>
                                  <span className="text-[10px] text-surface-400">{timeAgo(c.createdAt)}</span>
                                </div>
                                <p className="text-sm text-surface-700 mt-0.5 whitespace-pre-wrap break-words">{c.text}</p>
                              </div>
                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteComment(cid)}
                                  title="Delete comment"
                                  className="shrink-0 p-1 rounded hover:bg-red-50 text-surface-300 hover:text-red-500 transition"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                  <form onSubmit={handleAddComment} className="flex items-end gap-2">
                    <textarea
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Write a comment…"
                      rows={2}
                      maxLength={2000}
                      disabled={commentBusy}
                      className="flex-1 px-3 py-2 text-sm bg-white border border-surface-200 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 rounded-xl resize-none transition disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={commentBusy || !commentInput.trim()}
                      className="shrink-0 btn-primary text-xs py-2 px-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {commentBusy ? "Posting…" : "Post"}
                    </button>
                  </form>
                </div>
              )}

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
