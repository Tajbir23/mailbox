"use client";

import { useState } from "react";

export default function ShareModal({ mailbox, onClose, onShared }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleShare = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch(`/api/mailboxes/${mailbox._id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to share");
        return;
      }

      setSuccess(`Shared with ${email}`);
      setEmail("");
      if (onShared) onShared();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId) => {
    try {
      const res = await fetch(`/api/mailboxes/${mailbox._id}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (res.ok && onShared) onShared();
    } catch {
      setError("Failed to remove user");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            Share Mailbox
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Sharing{" "}
          <span className="font-mono text-indigo-600">{mailbox.emailAddress}</span>
        </p>

        {/* Current shared users */}
        {mailbox.sharedWith?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Currently shared with:
            </p>
            <ul className="space-y-1">
              {mailbox.sharedWith.map((u) => (
                <li
                  key={u._id}
                  className="flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded text-sm"
                >
                  <span>
                    {u.name} ({u.email})
                  </span>
                  <button
                    onClick={() => handleRemove(u._id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleShare} className="flex items-center space-x-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            {loading ? "…" : "Share"}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-3 text-sm text-green-600 bg-green-50 p-2 rounded">
            {success}
          </p>
        )}
      </div>
    </div>
  );
}
