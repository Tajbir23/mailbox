"use client";

import Link from "next/link";
import { useState } from "react";
import ShareModal from "./ShareModal";

export default function MailboxList({ mailboxes, userId, onUpdate }) {
  const [shareTarget, setShareTarget] = useState(null);

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
              return (
                <li
                  key={mb._id}
                  className="px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-gray-50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/inbox/${mb._id}`}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm truncate block"
                    >
                      {mb.emailAddress}
                    </Link>
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
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
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
