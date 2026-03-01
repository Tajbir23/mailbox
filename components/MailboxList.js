"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import ShareModal from "./ShareModal";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

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

function timeUntil(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date - now;
  if (diffMs <= 0) return "expiring...";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m left`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h left`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d left`;
}

// ── MailboxActions dropdown ──
function MailboxActions({ mb, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(null);
  const [transferEmail, setTransferEmail] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
        setAction(null);
        setError("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDelete = async () => {
    if (!confirm(`Delete "${mb.emailAddress}" and ALL emails permanently?`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/mailboxes/${mb._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDelete(mb._id);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/mailboxes/${mb._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", newOwnerEmail: transferEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate();
      setOpen(false);
      setAction(null);
      setTransferEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExpiry = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const expiresAt = expiryDate && expiryTime
        ? new Date(`${expiryDate}T${expiryTime}`).toISOString()
        : expiryDate
        ? new Date(`${expiryDate}T23:59:59`).toISOString()
        : null;
      const res = await fetch(`/api/mailboxes/${mb._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setExpiry", expiresAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate();
      setOpen(false);
      setAction(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removeExpiry = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/mailboxes/${mb._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setExpiry", expiresAt: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate();
      setOpen(false);
      setAction(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => { setOpen(!open); setAction(null); setError(""); }}
        className="p-2 rounded-xl hover:bg-surface-100 transition-all text-surface-400 hover:text-surface-600"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 card shadow-soft-lg overflow-hidden animate-scale-in">
          {!action && (
            <div className="p-1.5">
              <button
                onClick={() => setAction("transfer")}
                className="w-full px-3 py-2.5 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-xl flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Transfer Ownership</p>
                  <p className="text-xs text-surface-400">Move to another user</p>
                </div>
              </button>
              <button
                onClick={() => setAction("expiry")}
                className="w-full px-3 py-2.5 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-xl flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Auto-Delete Timer</p>
                  <p className="text-xs text-surface-400">Schedule deletion</p>
                </div>
              </button>
              <div className="my-1 mx-3 border-t border-surface-100" />
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">{loading ? "Deleting…" : "Delete Forever"}</p>
                  <p className="text-xs text-red-400">Remove mailbox & all emails</p>
                </div>
              </button>
            </div>
          )}

          {action === "transfer" && (
            <form onSubmit={handleTransfer} className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-surface-700">
                <button type="button" onClick={() => { setAction(null); setError(""); }} className="p-1 rounded-lg hover:bg-surface-100 transition text-surface-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                Transfer Ownership
              </div>
              <input
                type="email"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                placeholder="New owner's email"
                required
                className="input-field text-sm"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full text-sm py-2">
                {loading ? "Transferring…" : "Transfer"}
              </button>
            </form>
          )}

          {action === "expiry" && (
            <form onSubmit={handleExpiry} className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-surface-700">
                <button type="button" onClick={() => { setAction(null); setError(""); }} className="p-1 rounded-lg hover:bg-surface-100 transition text-surface-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                Auto-Delete Timer
              </div>
              <div className="space-y-2">
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} min={new Date().toISOString().split("T")[0]} required className="input-field text-sm" />
                <input type="time" value={expiryTime} onChange={(e) => setExpiryTime(e.target.value)} className="input-field text-sm" />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={loading} className="w-full px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-[0.98]">
                {loading ? "Setting…" : "Set Timer"}
              </button>
              {mb.expiresAt && (
                <button type="button" onClick={removeExpiry} disabled={loading} className="btn-ghost w-full text-sm text-red-500 hover:bg-red-50 py-2">
                  Remove Timer
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function MailboxList({ mailboxes: initialMailboxes, userId, onUpdate }) {
  const [shareTarget, setShareTarget] = useState(null);
  const [mailboxes, setMailboxes] = useState(initialMailboxes);
  const [copiedId, setCopiedId] = useState(null);
  const socketRef = useRef(null);

  const copyEmail = (email, id) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteMailbox = (deletedId) => {
    setMailboxes((prev) => prev.filter((mb) => mb._id !== deletedId));
  };

  useEffect(() => {
    setMailboxes(initialMailboxes);
  }, [initialMailboxes]);

  useEffect(() => {
    if (!userId) return;
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => { socket.emit("join-dashboard", userId); });
    socket.on("dashboard-new-email", (data) => {
      setMailboxes((prev) =>
        prev.map((mb) => {
          if (mb._id === data.mailboxId) {
            return { ...mb, lastEmail: data.lastEmail, unreadCount: (mb.unreadCount || 0) + 1 };
          }
          return mb;
        })
      );
    });
    return () => { socket.emit("leave-dashboard", userId); socket.disconnect(); };
  }, [userId]);

  return (
    <>
      <div className="card overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-800">My Mailboxes</h2>
              <p className="text-xs text-surface-400">{mailboxes.length} mailbox{mailboxes.length !== 1 ? "es" : ""}</p>
            </div>
          </div>
        </div>

        {mailboxes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-sm text-surface-400">No mailboxes yet</p>
            <p className="text-xs text-surface-300 mt-1">Create one to start receiving emails</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-50">
            {mailboxes.map((mb) => {
              const isOwner = mb.ownerId?._id === userId;
              const unread = mb.unreadCount || 0;
              const lastEmail = mb.lastEmail;

              return (
                <li key={mb._id} className="group px-4 sm:px-6 py-4 hover:bg-surface-50/60 transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${unread > 0 ? "bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-brand-sm" : "bg-surface-100 text-surface-500"}`}>
                          {mb.emailAddress?.charAt(0)?.toUpperCase() || "M"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/inbox/${mb._id}`}
                              className="text-sm font-semibold text-surface-800 hover:text-brand-600 truncate transition-colors"
                            >
                              {mb.emailAddress}
                            </Link>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyEmail(mb.emailAddress, mb._id); }}
                              className="shrink-0 p-1 rounded-lg hover:bg-surface-100 transition group/copy"
                              title="Copy email"
                            >
                              {copiedId === mb._id ? (
                                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-surface-300 group-hover/copy:text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                            {unread > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {isOwner ? (
                              <span className="badge-brand text-[10px] py-0.5 px-2">Owner</span>
                            ) : (
                              <span className="badge-warning text-[10px] py-0.5 px-2">Shared by {mb.ownerId?.name}</span>
                            )}
                            {mb.sharedWith?.length > 0 && (
                              <span className="badge-neutral text-[10px] py-0.5 px-2">
                                {mb.sharedWith.length} shared
                              </span>
                            )}
                            {mb.expiresAt && (
                              <span className="badge text-[10px] py-0.5 px-2 bg-orange-50 text-orange-600 border border-orange-100">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {timeUntil(mb.expiresAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Last email preview */}
                      {lastEmail && (
                        <Link
                          href={`/dashboard/inbox/${mb._id}`}
                          className="block mt-3 ml-[46px] p-3 rounded-xl bg-surface-50 border border-surface-100 hover:border-surface-200 hover:bg-white transition-all group/preview"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs truncate flex-1 ${!lastEmail.isRead ? "font-semibold text-surface-800" : "text-surface-500"}`}>
                              {lastEmail.subject || "(No Subject)"}
                            </p>
                            <span className="text-[10px] text-surface-400 whitespace-nowrap shrink-0">
                              {timeAgo(lastEmail.receivedAt)}
                            </span>
                          </div>
                          <p className="text-[11px] text-surface-400 truncate mt-0.5">
                            From: {(() => { const m = lastEmail.from?.match(/^"?([^"<]+?)"?\s*<([^>]+)>/); return m ? m[1].trim() : lastEmail.from; })()}
                          </p>
                        </Link>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-start sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {isOwner && (
                        <>
                          <button
                            onClick={() => setShareTarget(mb)}
                            className="btn-ghost text-xs py-1.5 px-3 rounded-lg"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            Share
                          </button>
                          <MailboxActions mb={mb} onUpdate={onUpdate} onDelete={handleDeleteMailbox} />
                        </>
                      )}
                      <Link
                        href={`/dashboard/inbox/${mb._id}`}
                        className="btn-primary text-xs py-1.5 px-3 rounded-lg"
                      >
                        Open
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {shareTarget && (
        <ShareModal
          mailbox={shareTarget}
          onClose={() => setShareTarget(null)}
          onShared={onUpdate}
        />
      )}
    </>
  );
}
