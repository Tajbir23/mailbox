"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";

export default function UserDomains() {
  const toast = useToast();
  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading] = useState(false);
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
    setLoading(true);

    try {
      const res = await fetch("/api/user/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDomain }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add domain");
        return;
      }

      toast.success(`"${data.name}" added — configure DNS records below`);
      setNewDomain("");
      fetchDomains();
      // Auto-expand the new domain
      setTimeout(() => {
        setExpandedId(data._id);
        loadDnsInfo(data._id);
      }, 300);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestHosting = async (domainId) => {
    try {
      const res = await fetch(`/api/user/domains/${domainId}/hosting`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to request hosting");
        return;
      }
      toast.success("Website hosting requested! Awaiting admin approval.");
      fetchDomains(); // refresh state
    } catch {
      toast.error("Network error");
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

      if (data.verificationStatus === "verified") {
        toast.success("Domain verified");
      } else if (data.results?.errors?.length > 0) {
        toast.error("Verification failed — check DNS records");
      } else {
        toast.info("Verification still pending");
      }

      fetchDomains();
    } catch {
      toast.error("Verification failed");
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
        toast.error(data.error || "Failed to update visibility");
        return;
      }
      toast.success(`Domain is now ${newVisibility}`);
      fetchDomains();
    } catch {
      toast.error("Network error");
    }
  };

  const handleDelete = async (id, name) => {
    const ok = await toast.confirm({
      title: "Delete domain?",
      message: `"${name}" will be removed. Mailboxes on this domain will stop receiving emails.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/user/domains?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchDomains();
        if (expandedId === id) setExpandedId(null);
        toast.success(`"${name}" deleted`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete domain");
      }
    } catch {
      toast.error("Failed to delete domain");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const statusBadge = (status) => {
    const map = {
      pending: "badge-warning",
      verified: "badge-success",
      failed: "badge-danger",
    };
    return (
      <span className={`${map[status] || map.pending}`}>
        {status === "pending" ? "Pending" : status === "verified" ? "Verified" : "Failed"}
      </span>
    );
  };

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
          <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-surface-900">My Domains</h2>
          <p className="text-xs text-surface-400">Add your own domains and configure DNS records</p>
        </div>
      </div>

      {/* Add domain form */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 mt-5 mb-4">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="mydomain.com"
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
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          )}
          Add Domain
        </button>
      </form>

      {/* Domain list */}
      {domains.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-2xl bg-surface-50 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
          </div>
          <p className="text-sm font-medium text-surface-500">No domains yet</p>
          <p className="text-xs text-surface-400 mt-1">Add your first domain above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map((d) => (
            <div key={d._id} className="border border-surface-200 rounded-2xl overflow-hidden hover:border-surface-300 transition-all">
              {/* Domain header row */}
              <div
                className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-50/50 cursor-pointer transition-all"
                onClick={() => toggleExpand(d._id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    d.verificationStatus === "verified"
                      ? "bg-green-50 text-green-600"
                      : "bg-surface-100 text-surface-500"
                  }`}>
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-surface-800 truncate block">
                      {d.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {statusBadge(d.verificationStatus)}
                      <span
                        className={d.visibility === "public" ? "badge-brand" : "badge-purple"}
                      >
                        {d.visibility === "public" ? "Public" : "Private"}
                      </span>
                    </div>
                  </div>
                </div>
                <svg className={`w-4 h-4 text-surface-400 transition-transform ${expandedId === d._id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>

              {/* Expanded DNS details */}
              {expandedId === d._id && (
                <div className="border-t border-surface-100 px-4 py-5 bg-surface-50/50 space-y-4 animate-slide-down">
                  {/* Required DNS Records */}
                  {dnsInfo[d._id]?.requiredRecords ? (
                    <div>
                      <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-3">
                        Required DNS Records
                      </h4>
                      <div className="space-y-3">
                        {/* MX Record */}
                        <div className="bg-white rounded-xl p-4 border border-surface-200 shadow-soft">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg">
                                MX
                              </span>
                              <span className="text-xs text-surface-500">
                                {dnsInfo[d._id].requiredRecords.mx.description}
                              </span>
                            </div>
                            {d.dnsRecords?.mxVerified ? (
                              <span className="badge-success">✓ Verified</span>
                            ) : (
                              <span className="badge-warning">✗ Not found</span>
                            )}
                          </div>
                          <div className="bg-surface-900 rounded-xl p-3 mt-2 flex items-center justify-between group">
                            <code className="text-xs text-green-400 break-all font-mono">
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
                              className="text-xs text-surface-500 hover:text-white ml-3 shrink-0 bg-surface-800 hover:bg-surface-700 px-2.5 py-1 rounded-lg transition-all"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-surface-400 flex flex-wrap gap-x-3 gap-y-1">
                            <span><strong className="text-surface-500">Host:</strong> {d.name}</span>
                            <span><strong className="text-surface-500">Priority:</strong> {dnsInfo[d._id].requiredRecords.mx.priority}</span>
                            <span><strong className="text-surface-500">Value:</strong> {dnsInfo[d._id].requiredRecords.mx.value}</span>
                          </div>
                        </div>

                        {/* TXT Record */}
                        <div className="bg-white rounded-xl p-4 border border-surface-200 shadow-soft">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg">
                                TXT
                              </span>
                              <span className="text-xs text-surface-500">
                                {dnsInfo[d._id].requiredRecords.txt.description}
                              </span>
                            </div>
                            {d.dnsRecords?.txtVerified ? (
                              <span className="badge-success">✓ Verified</span>
                            ) : (
                              <span className="badge-warning">✗ Not found</span>
                            )}
                          </div>
                          <div className="bg-surface-900 rounded-xl p-3 mt-2 flex items-center justify-between group">
                            <code className="text-xs text-green-400 break-all font-mono">
                              {d.name}. IN TXT &quot;{dnsInfo[d._id].requiredRecords.txt.value}&quot;
                            </code>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(dnsInfo[d._id].requiredRecords.txt.value);
                              }}
                              className="text-xs text-surface-500 hover:text-white ml-3 shrink-0 bg-surface-800 hover:bg-surface-700 px-2.5 py-1 rounded-lg transition-all"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-surface-400 flex flex-wrap gap-x-3 gap-y-1">
                            <span><strong className="text-surface-500">Host:</strong> {d.name}</span>
                            <span><strong className="text-surface-500">Value:</strong> {dnsInfo[d._id].requiredRecords.txt.value}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                      </div>
                    </div>
                  )}

                  {/* Verification results (if a check was run) */}
                  {dnsInfo[d._id]?.results?.errors?.length > 0 && (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200/50">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <h4 className="text-xs font-bold text-red-700">Verification Issues</h4>
                      </div>
                      <ul className="text-xs text-red-600 space-y-1.5">
                        {dnsInfo[d._id].results.errors.map((err, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5">•</span>
                            {err}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Website Hosting Request Section */}
                  {d.verificationStatus === "verified" && (
                    <div className="border-t border-surface-200 mt-4 pt-4">
                      {d.websiteStatus === "approved" ? (
                        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                          <h4 className="text-sm font-bold text-green-700 mb-2">🎉 Website Hosting Approved</h4>
                          <p className="text-xs text-green-600 mb-3">Your domain is ready to point to our servers!</p>
                          <div className="bg-white rounded-lg p-3 border border-green-100 mb-3 space-y-2 text-xs">
                            <p><strong>Step 1:</strong> Go to your domain registrar's DNS settings.</p>
                            <p><strong>Step 2:</strong> Add an <code>A Record</code> with the Host <code>@</code> pointing to <code className="bg-surface-100 px-1 rounded text-brand-600">209.74.81.85</code></p>
                            <p><strong>Step 3:</strong> Wait for DNS to propagate. Your website will be active automatically!</p>
                          </div>
                        </div>
                      ) : d.websiteStatus === "pending" ? (
                        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-amber-700">Hosting Request Pending</h4>
                            <p className="text-xs text-amber-600">Waiting for admin approval to host your website here.</p>
                          </div>
                          <span className="animate-pulse bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-medium">Pending</span>
                        </div>
                      ) : d.websiteStatus === "rejected" ? (
                        <div className="bg-red-50 rounded-xl p-4 border border-red-200 flex justify-between items-center">
                          <div>
                            <h4 className="text-sm font-bold text-red-700">Hosting Request Rejected</h4>
                            <p className="text-xs text-red-600">Contact support for more details.</p>
                          </div>
                          <button onClick={() => handleRequestHosting(d._id)} className="btn-primary !bg-red-600 hover:!bg-red-700 !text-xs !py-1.5 !px-3 !rounded-lg">Request Again</button>
                        </div>
                      ) : (
                        <div className="bg-surface-100/50 rounded-xl p-4 border border-surface-200 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-bold text-surface-800">Want to host your Custom Website?</h4>
                            <p className="text-xs text-surface-500">Request permission to use our servers for your site.</p>
                          </div>
                          <button
                            onClick={() => handleRequestHosting(d._id)}
                            className="bg-brand-600 hover:bg-brand-700 text-white text-xs px-4 py-2 rounded-lg font-medium transition-all"
                          >
                            Request Hosting
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-surface-200">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVerify(d._id);
                        }}
                        disabled={verifying === d._id}
                        className="btn-primary !text-xs !py-2 !px-4 !rounded-xl flex items-center gap-1.5"
                      >
                        {verifying === d._id ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Checking…
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Verify DNS
                          </>
                        )}
                      </button>

                      {d.verificationStatus === "verified" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(d._id, d.visibility);
                          }}
                          className={`text-xs px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                            d.visibility === "private"
                              ? "bg-brand-50 hover:bg-brand-100 text-brand-700"
                              : "bg-purple-50 hover:bg-purple-100 text-purple-700"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          {d.visibility === "private" ? "Make Public" : "Make Private"}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(d._id, d.name);
                      }}
                      className="btn-danger !text-xs !py-2 !px-4 !rounded-xl flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  </div>

                  {d.verificationStatus !== "verified" && (
                    <div className="flex items-start gap-2 text-xs text-surface-400 bg-surface-100/50 rounded-xl p-3">
                      <svg className="w-4 h-4 text-surface-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Add both DNS records at your domain registrar, wait a few minutes for
                      propagation, then click &quot;Verify DNS&quot;.
                    </div>
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
