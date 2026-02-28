"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import io from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

// ── Basic HTML sanitizer for email body (XSS protection) ──
function sanitizeHtml(html) {
  if (!html) return "";
  // Remove script tags, event handlers, and dangerous protocols
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "blocked:")
    .replace(/vbscript\s*:/gi, "blocked:")
    .replace(/data\s*:\s*text\/html/gi, "blocked:");
}

export default function InboxView({ mailboxId }) {
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  // Fetch existing emails
  useEffect(() => {
    setLoading(true);
    fetch(`/api/mailboxes/${mailboxId}/emails`)
      .then((res) => res.json())
      .then((data) => {
        setEmails(data.emails || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mailboxId]);

  // Socket.io real-time listener
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-mailbox", mailboxId);
    });

    socket.on("new-email", (email) => {
      setEmails((prev) => [email, ...prev]);
    });

    return () => {
      socket.emit("leave-mailbox", mailboxId);
      socket.disconnect();
    };
  }, [mailboxId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-10rem)] bg-white rounded-lg shadow overflow-hidden">
      {/* Email list */}
      <div className="w-full md:w-1/3 md:min-w-[240px] md:max-w-[360px] border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto shrink-0 max-h-[40vh] md:max-h-none">
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
                onClick={() => setSelected(email)}
                className={`px-4 py-3 cursor-pointer hover:bg-indigo-50 transition ${
                  selected?._id === email._id ? "bg-indigo-50 border-l-2 border-indigo-600" : ""
                }`}
              >
                <p className="text-sm font-medium text-gray-800 truncate">
                  {email.subject || "(No Subject)"}
                </p>
                <p className="text-xs text-gray-500 truncate">{email.from}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(email.receivedAt).toLocaleString()}
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
              <span className="whitespace-nowrap">{new Date(selected.receivedAt).toLocaleString()}</span>
            </div>
            <hr className="mb-4" />
            {selected.bodyHtml ? (
              <div
                className="prose max-w-none overflow-x-auto break-words"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.bodyHtml) }}
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
  );
}
