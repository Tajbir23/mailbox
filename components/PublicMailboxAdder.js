"use client";

import { useState } from "react";
import { usePublicMailboxes } from "./usePublicMailboxes";

export default function PublicMailboxAdder() {
  const { list, update } = usePublicMailboxes();
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const email = input.toLowerCase().trim();
    if (!email) return;

    if (list.find((m) => m.emailAddress === email)) {
      setError("Already saved — scroll down to see it");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(
        `/api/public/mailbox?email=${encodeURIComponent(email)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add mailbox");
        return;
      }
      update((prev) => {
        // Dedupe against fresh localStorage read (handles multi-tab race
        // where another tab added the same mailbox first).
        if (prev.some((m) => m._id === data._id)) return prev;
        return [
          { _id: data._id, emailAddress: data.emailAddress, savedAt: Date.now() },
          ...prev,
        ];
      });
      setInput("");
      setSuccess(`Watching ${data.emailAddress} below ↓`);
      setTimeout(() => setSuccess(""), 4000);
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto animate-slide-up" style={{ animationDelay: "0.4s" }}>
      <form
        onSubmit={handleAdd}
        className="flex flex-col sm:flex-row gap-2 p-2 bg-white/80 backdrop-blur-sm border border-surface-200 rounded-2xl shadow-soft-lg"
      >
        <div className="relative flex-1 min-w-0">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <input
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="someone@yourdomain.com"
            className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none pl-10 pr-3 py-2.5 text-sm text-surface-800 placeholder:text-surface-400"
            required
          />
        </div>
        <button
          type="submit"
          disabled={adding || !input}
          className="btn-primary text-sm whitespace-nowrap rounded-xl"
        >
          {adding ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Checking…
            </span>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Save Mail
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-surface-500 mt-3">
        Drop a public mailbox address — no signup. Saves to this browser, receives in real-time.
      </p>

      {error && (
        <div className="mt-3 mx-auto max-w-md flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 mx-auto max-w-md flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {success}
        </div>
      )}
    </div>
  );
}
