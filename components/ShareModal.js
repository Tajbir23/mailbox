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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-full max-w-md mx-4 p-0 animate-scale-in shadow-brand-lg">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-100">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-surface-900">Share Mailbox</h3>
                <p className="text-xs text-surface-400 mt-0.5">Invite others to access this mailbox</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-surface-100 flex items-center justify-center text-surface-400 hover:text-surface-600 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Mailbox info */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-brand-50/50 border border-brand-100/50 mb-5">
            <svg className="w-4 h-4 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <span className="text-sm font-medium text-brand-700 truncate">{mailbox.emailAddress}</span>
          </div>

          {/* Current shared users */}
          {mailbox.sharedWith?.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2.5">
                Shared with
              </p>
              <div className="space-y-2">
                {mailbox.sharedWith.map((u) => (
                  <div
                    key={u._id}
                    className="flex items-center justify-between bg-surface-50 px-3.5 py-2.5 rounded-xl"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold">
                        {(u.name?.[0] || "?").toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-700">{u.name}</p>
                        <p className="text-xs text-surface-400">{u.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(u._id)}
                      className="text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-all"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share form */}
          <form onSubmit={handleShare} className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="input-field flex-1 !rounded-xl"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary !rounded-xl !px-5 shrink-0 flex items-center gap-1.5"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              )}
              Share
            </button>
          </form>

          {/* Alerts */}
          {error && (
            <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200/50 rounded-xl text-sm text-red-600">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-green-50 border border-green-200/50 rounded-xl text-sm text-green-600">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {success}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
