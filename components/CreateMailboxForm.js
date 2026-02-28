"use client";

import { useState, useEffect } from "react";

export default function CreateMailboxForm({ onCreated }) {
  const [domains, setDomains] = useState([]);
  const [prefix, setPrefix] = useState("");
  const [domainId, setDomainId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => {
        setDomains(data);
        if (data.length > 0) setDomainId(data[0]._id);
      })
      .catch(() => setError("Failed to load domains"));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, domainId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create mailbox");
        return;
      }

      setSuccess(`Created ${data.emailAddress}`);
      setPrefix("");
      if (onCreated) onCreated(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const selectedDomain = domains.find((d) => d._id === domainId);
  const publicDomains = domains.filter((d) => d.visibility === "public");
  const privateDomains = domains.filter((d) => d.visibility === "private");

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
          <svg className="w-4.5 h-4.5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-surface-800">New Mailbox</h2>
          <p className="text-xs text-surface-400">Create a new receiving address</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <input
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="username"
            className="input-field flex-1 min-w-0 !rounded-xl"
            required
          />
          <div className="flex items-center gap-2">
            <span className="text-surface-400 font-medium text-center hidden sm:block">@</span>
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="input-field w-full sm:w-auto sm:min-w-[160px] sm:max-w-[220px] truncate !rounded-xl"
            >
              {publicDomains.length > 0 && (
                <optgroup label="Public Domains">
                  {publicDomains.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {privateDomains.length > 0 && (
                <optgroup label="My Domains">
                  {privateDomains.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {domains.length === 0 && (
                <option disabled>No domains available</option>
              )}
            </select>
          </div>
        </div>

        {prefix && selectedDomain && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand-50/60 border border-brand-100 rounded-xl">
            <svg className="w-4 h-4 text-brand-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-mono text-brand-700">
              {prefix.toLowerCase()}@{selectedDomain.name}
            </span>
            {selectedDomain.visibility === "private" && (
              <span className="badge-purple text-[10px] py-0.5 px-1.5 ml-auto">Private</span>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || domains.length === 0}
          className="btn-primary w-full text-sm"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating…
            </span>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Mailbox
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {success}
        </div>
      )}
    </div>
  );
}
