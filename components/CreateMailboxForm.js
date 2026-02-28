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
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Create New Mailbox
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="prefix"
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            required
          />
          <span className="text-gray-500 font-medium text-center hidden sm:block">@</span>
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-full sm:w-auto sm:min-w-[160px] sm:max-w-[220px] truncate"
          >
            {publicDomains.length > 0 && (
              <optgroup label="🌐 Public Domains">
                {publicDomains.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
            {privateDomains.length > 0 && (
              <optgroup label="🔒 My Domains">
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

        {prefix && selectedDomain && (
          <p className="text-xs text-gray-400">
            Preview:{" "}
            <span className="font-mono text-indigo-600">
              {prefix.toLowerCase()}@{selectedDomain.name}
            </span>
            {selectedDomain.visibility === "private" && (
              <span className="ml-2 text-purple-500">(Private domain)</span>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || domains.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-2 rounded-lg transition text-sm"
        >
          {loading ? "Creating…" : "Create Mailbox"}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
      )}
      {success && (
        <p className="mt-3 text-sm text-green-600 bg-green-50 p-2 rounded">{success}</p>
      )}
    </div>
  );
}
