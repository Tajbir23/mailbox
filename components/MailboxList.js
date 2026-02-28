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

export default function MailboxList({ mailboxes: initialMailboxes, userId, onUpdate }) {
  const [shareTarget, setShareTarget] = useState(null);
  const [mailboxes, setMailboxes] = useState(initialMailboxes);
  const socketRef = useRef(null);

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

                        {unread > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 mt-1 flex-wrap">
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
                        <button
                          onClick={() => setShareTarget(mb)}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-md transition whitespace-nowrap"
                        >
                          Share
                        </button>
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
