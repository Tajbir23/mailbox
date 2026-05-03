"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PublicMailboxAdder() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [navigating, setNavigating] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const email = input.toLowerCase().trim();
    if (!email) return;
    setNavigating(true);
    router.push(`/mailbox?mail=${encodeURIComponent(email)}`);
  };

  return (
    <div className="w-full max-w-xl mx-auto animate-slide-up" style={{ animationDelay: "0.4s" }}>
      <form
        onSubmit={handleSubmit}
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
          disabled={navigating || !input}
          className="btn-primary text-sm whitespace-nowrap rounded-xl"
        >
          {navigating ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Opening…
            </span>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Save Mail
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-surface-500 mt-3">
        Enter a public mailbox address — opens a shareable inbox at{" "}
        <code className="font-mono text-surface-600">/mailbox?mail=…</code>
      </p>
    </div>
  );
}
