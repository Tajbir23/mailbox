"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

// ── Basic HTML sanitizer for email body (XSS protection) ──
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* New email notification toast */}
      {newEmailAlert && (
        <div className="mb-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2 animate-bounce">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
          New email received!
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 bg-white rounded-lg shadow overflow-hidden">
        {/* Email list */}
        <div className="w-full md:w-1/3 md:min-w-[260px] md:max-w-[380px] border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto shrink-0 max-h-[40vh] md:max-h-none">
          {/* Header with unread count */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                Inbox
              </span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {emails.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No emails yet. Waiting for incoming mail…
              <div className="mt-2 animate-pulse text-indigo-400">●</div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {emails.map((email) => (
                <li
                  key={email._id}
                  onClick={() => handleSelectEmail(email)}
                  className={`px-4 py-3 cursor-pointer hover:bg-indigo-50 transition relative ${
                    selected?._id === email._id
                      ? "bg-indigo-50 border-l-2 border-indigo-600"
                      : ""
                  } ${!email.isRead ? "bg-blue-50/50" : ""}`}
                >
                  {/* Unread dot */}
                  {!email.isRead && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full" />
                  )}

                  <p
                    className={`text-sm truncate ${
                      !email.isRead
                        ? "font-semibold text-gray-900"
                        : "font-medium text-gray-700"
                    }`}
                  >
                    {email.subject || "(No Subject)"}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {email.from}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {timeAgo(email.receivedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Email detail */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {selected ? (
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                {selected.subject}
              </h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 mb-4">
                <span className="break-all">
                  <strong>From:</strong> {selected.from}
                </span>
                <span className="break-all">
                  <strong>To:</strong> {selected.to}
                </span>
                <span className="whitespace-nowrap">
                  {new Date(selected.receivedAt).toLocaleString()}
                </span>
              </div>
              <hr className="mb-4" />
              {selected.bodyHtml ? (
                <div
                  className="prose max-w-none overflow-x-auto break-words"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(selected.bodyHtml),
                  }}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {selected.bodyText || "(Empty body)"}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select an email to read
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
