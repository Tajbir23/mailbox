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
  const [action, setAction] = useState(null); // "delete" | "transfer" | "expiry"
  const [transferEmail, setTransferEmail] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef(null);

  // Close dropdown on outside click
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
        className="p-1.5 rounded-md hover:bg-gray-200 transition text-gray-500 hover:text-gray-700"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-64 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
          {!action && (
            <div className="py-1">
              <button
                onClick={() => setAction("transfer")}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer Ownership
              </button>
              <button
                onClick={() => setAction("expiry")}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Set Auto-Delete Timer
              </button>
              <hr className="my-1" />
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {loading ? "Deleting..." : "Delete Mailbox"}
              </button>
            </div>
          )}

          {/* Transfer form */}
          {action === "transfer" && (
            <form onSubmit={handleTransfer} className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <button type="button" onClick={() => { setAction(null); setError(""); }} className="text-gray-400 hover:text-gray-600">
                  ←
                </button>
                Transfer Ownership
              </div>
              <input
                type="email"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                placeholder="New owner's email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {loading ? "Transferring..." : "Transfer"}
              </button>
            </form>
          )}

          {/* Expiry form */}
          {action === "expiry" && (
            <form onSubmit={handleExpiry} className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <button type="button" onClick={() => { setAction(null); setError(""); }} className="text-gray-400 hover:text-gray-600">
                  ←
                </button>
                Auto-Delete Timer
              </div>
              <div className="space-y-2">
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <input
                  type="time"
                  value={expiryTime}
                  onChange={(e) => setExpiryTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-3 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700 disabled:opacity-50 transition"
              >
                {loading ? "Setting..." : "Set Timer"}
              </button>
              {mb.expiresAt && (
                <button
                  type="button"
                  onClick={removeExpiry}
                  disabled={loading}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-md hover:bg-gray-200 disabled:opacity-50 transition"
                >
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

  // Sync with parent props
  useEffect(() => {
    setMailboxes(initialMailboxes);
  }, [initialMailboxes]);

  // Socket.io: join dashboard room for real-time updates
  useEffect(() => {
    if (!userId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-dashboard", userId);
    });

    socket.on("dashboard-new-email", (data) => {
      setMailboxes((prev) =>
        prev.map((mb) => {
          if (mb._id === data.mailboxId) {
            return {
              ...mb,
              lastEmail: data.lastEmail,
              unreadCount: (mb.unreadCount || 0) + 1,
            };
          }
          return mb;
        })
      );
    });

    return () => {
      socket.emit("leave-dashboard", userId);
      socket.disconnect();
    };
  }, [userId]);

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">My Mailboxes</h2>
        </div>

        {mailboxes.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            No mailboxes yet. Create one above!
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {mailboxes.map((mb) => {
              const isOwner = mb.ownerId?._id === userId;
              const unread = mb.unreadCount || 0;
              const lastEmail = mb.lastEmail;

              return (
                <li
                  key={mb._id}
                  className="px-3 sm:px-6 py-3 sm:py-4 hover:bg-gray-50 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    {/* Left: mailbox info + last email */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/inbox/${mb._id}`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-sm truncate"
                        >
                          {mb.emailAddress}
                        </Link>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyEmail(mb.emailAddress, mb._id);
                          }}
                          className="shrink-0 p-1 rounded hover:bg-gray-200 transition group relative"
                          title="Copy email address"
                        >
                          {copiedId === mb._id ? (
                            <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>

                        {unread > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                        {isOwner ? (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            Owner
                          </span>
                        ) : (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                            Shared by {mb.ownerId?.name}
                          </span>
                        )}
                        {mb.sharedWith?.length > 0 && (
                          <span className="text-xs text-gray-400">
                            Shared with {mb.sharedWith.length} user(s)
                          </span>
                        )}
                        {mb.expiresAt && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {timeUntil(mb.expiresAt)}
                          </span>
                        )}
                      </div>

                      {/* Last email preview */}
                      {lastEmail && (
                        <Link
                          href={`/dashboard/inbox/${mb._id}`}
                          className="block mt-2 p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`text-xs truncate flex-1 ${
                                !lastEmail.isRead
                                  ? "font-semibold text-gray-900"
                                  : "text-gray-600"
                              }`}
                            >
                              {lastEmail.subject || "(No Subject)"}
                            </p>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                              {timeAgo(lastEmail.receivedAt)}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">
                            From: {lastEmail.from}
                          </p>
                        </Link>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center space-x-2 shrink-0 self-end sm:self-start">
                      {isOwner && (
                        <>
                          <button
                            onClick={() => setShareTarget(mb)}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-md transition whitespace-nowrap"
                          >
                            Share
                          </button>
                          <MailboxActions mb={mb} onUpdate={onUpdate} onDelete={handleDeleteMailbox} />
                        </>
                      )}
                      <Link
                        href={`/dashboard/inbox/${mb._id}`}
                        className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md transition whitespace-nowrap"
                      >
                        Open Inbox →
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
