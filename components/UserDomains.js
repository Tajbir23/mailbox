"use client";

import { useState, useEffect, useCallback } from "react";

export default function UserDomains() {
  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [dnsInfo, setDnsInfo] = useState({});
  const [verifying, setVerifying] = useState(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/user/domains");
      if (res.ok) {
        const data = await res.json();
        setDomains(data);
      }
    } catch {
      console.error("Failed to fetch user domains");
    }
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Fetch DNS info for a domain when expanded
  const loadDnsInfo = async (domainId) => {
    if (dnsInfo[domainId]) return; // already loaded
    try {
      const res = await fetch(`/api/user/domains/${domainId}/verify`);
      if (res.ok) {
        const data = await res.json();
        setDnsInfo((prev) => ({ ...prev, [domainId]: data }));
      }
    } catch {
      console.error("Failed to load DNS info");
    }
  };

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadDnsInfo(id);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDomain }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add domain");
        return;
      }

      setSuccess(`Domain "${data.name}" added! Configure DNS records below.`);
      setNewDomain("");
      fetchDomains();
      // Auto-expand the new domain
      setTimeout(() => {
        setExpandedId(data._id);
        loadDnsInfo(data._id);
      }, 300);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (domainId) => {
    setVerifying(domainId);
    try {
      const res = await fetch(`/api/user/domains/${domainId}/verify`, {
        method: "POST",
      });
      const data = await res.json();

      // Update DNS info cache with fresh results
      setDnsInfo((prev) => ({
        ...prev,
        [domainId]: {
          ...prev[domainId],
          verificationStatus: data.verificationStatus,
          dnsRecords: data.dnsRecords,
          results: data.results,
        },
      }));

      fetchDomains();
    } catch {
      setError("Verification failed");
    } finally {
      setVerifying(null);
    }
  };

  const handleToggleVisibility = async (domainId, currentVisibility) => {
    const newVisibility = currentVisibility === "public" ? "private" : "public";
    try {
      const res = await fetch("/api/user/domains", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: domainId, visibility: newVisibility }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update visibility");
        return;
      }
      fetchDomains();
    } catch {
      setError("Network error");
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? Mailboxes on this domain will stop receiving emails.`))
      return;

    try {
      const res = await fetch(`/api/user/domains?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchDomains();
        if (expandedId === id) setExpandedId(null);
      }
    } catch {
      setError("Failed to delete domain");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const statusBadge = (status) => {
    const map = {
      pending: "bg-yellow-100 text-yellow-700",
      verified: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] || map.pending}`}>
        {status === "pending" ? "Pending" : status === "verified" ? "Verified" : "Failed"}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">My Domains</h2>
      <p className="text-xs text-gray-400 mb-4">
        Add your own domains. Configure DNS records to receive emails on them.
      </p>

      <form onSubmit={handleAdd} className="flex items-center space-x-2 mb-4">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="mydomain.com"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap"
        >
          {loading ? "Adding…" : "Add Domain"}
        </button>
      </form>

      {error && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
      )}
      {success && (
        <p className="mb-3 text-sm text-green-600 bg-green-50 p-2 rounded">{success}</p>
      )}

      {domains.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">
          No domains yet. Add one above!
        </p>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => (
            <div key={d._id} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Domain header row */}
              <div
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition"
                onClick={() => toggleExpand(d._id)}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {d.name}
                  </span>
                  {statusBadge(d.verificationStatus)}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      d.visibility === "public"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {d.visibility === "public" ? "Public" : "Private"}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-xs">
                    {expandedId === d._id ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* Expanded DNS details */}
              {expandedId === d._id && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                  {/* Required DNS Records */}
                  {dnsInfo[d._id]?.requiredRecords ? (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">
                        Required DNS Records
                      </h4>
                      <div className="space-y-3">
                        {/* MX Record */}
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                MX
                              </span>
                              <span className="text-xs text-gray-500">
                                {dnsInfo[d._id].requiredRecords.mx.description}
                              </span>
                            </div>
                            {d.dnsRecords?.mxVerified ? (
                              <span className="text-xs text-green-600">✓ Verified</span>
                            ) : (
                              <span className="text-xs text-yellow-600">✗ Not found</span>
                            )}
                          </div>
                          <div className="bg-gray-900 rounded p-2 mt-1 flex items-center justify-between">
                            <code className="text-xs text-green-400 break-all">
                              {d.name}. IN MX {dnsInfo[d._id].requiredRecords.mx.priority}{" "}
                              {dnsInfo[d._id].requiredRecords.mx.value}.
                            </code>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(
                                  `${d.name}. IN MX ${dnsInfo[d._id].requiredRecords.mx.priority} ${dnsInfo[d._id].requiredRecords.mx.value}.`
                                );
                              }}
                              className="text-xs text-gray-400 hover:text-white ml-2 whitespace-nowrap"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-gray-400">
                            <strong>Host:</strong> {d.name} &nbsp;|&nbsp;
                            <strong>Priority:</strong> {dnsInfo[d._id].requiredRecords.mx.priority} &nbsp;|&nbsp;
                            <strong>Value:</strong> {dnsInfo[d._id].requiredRecords.mx.value}
                          </div>
                        </div>

                        {/* TXT Record */}
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                TXT
                              </span>
                              <span className="text-xs text-gray-500">
                                {dnsInfo[d._id].requiredRecords.txt.description}
                              </span>
                            </div>
                            {d.dnsRecords?.txtVerified ? (
                              <span className="text-xs text-green-600">✓ Verified</span>
                            ) : (
                              <span className="text-xs text-yellow-600">✗ Not found</span>
                            )}
                          </div>
                          <div className="bg-gray-900 rounded p-2 mt-1 flex items-center justify-between">
                            <code className="text-xs text-green-400 break-all">
                              {d.name}. IN TXT &quot;{dnsInfo[d._id].requiredRecords.txt.value}&quot;
                            </code>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(dnsInfo[d._id].requiredRecords.txt.value);
                              }}
                              className="text-xs text-gray-400 hover:text-white ml-2 whitespace-nowrap"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-gray-400">
                            <strong>Host:</strong> {d.name} &nbsp;|&nbsp;
                            <strong>Value:</strong> {dnsInfo[d._id].requiredRecords.txt.value}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600" />
                    </div>
                  )}

                  {/* Verification results (if a check was run) */}
                  {dnsInfo[d._id]?.results?.errors?.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                      <h4 className="text-xs font-semibold text-red-700 mb-1">
                        Verification Issues
                      </h4>
                      <ul className="text-xs text-red-600 space-y-1">
                        {dnsInfo[d._id].results.errors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVerify(d._id);
                        }}
                        disabled={verifying === d._id}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded-md transition font-medium"
                      >
                        {verifying === d._id ? "Checking DNS…" : "Verify DNS Records"}
                      </button>

                      {d.verificationStatus === "verified" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(d._id, d.visibility);
                          }}
                          className={`text-xs px-3 py-1.5 rounded-md transition font-medium ${
                            d.visibility === "private"
                              ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                              : "bg-purple-50 hover:bg-purple-100 text-purple-700"
                          }`}
                        >
                          {d.visibility === "private"
                            ? "Make Public"
                            : "Make Private"}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(d._id, d.name);
                      }}
                      className="text-xs text-red-500 hover:text-red-700 transition"
                    >
                      Delete
                    </button>
                  </div>

                  {d.verificationStatus !== "verified" && (
                    <p className="text-xs text-gray-400 italic">
                      Add both DNS records at your domain registrar, wait a few minutes for
                      propagation, then click &quot;Verify DNS Records&quot;.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
