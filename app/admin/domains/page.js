"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

export default function AdminDomainsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/domains");
      if (res.ok) {
        const data = await res.json();
        setDomains(data);
      }
    } catch {
      console.error("Failed to fetch domains");
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      if (session.user.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      fetchDomains();
    }
  }, [status, session, router, fetchDomains]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDomain, visibility }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add domain");
        return;
      }

      setNewDomain("");
      setVisibility("public");
      fetchDomains();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id, isActive) => {
    await fetch("/api/admin/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    fetchDomains();
  };

  const handleVisibilityToggle = async (id, currentVisibility) => {
    const newVisibility = currentVisibility === "public" ? "private" : "public";
    await fetch("/api/admin/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, visibility: newVisibility }),
    });
    fetchDomains();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this domain? Existing mailboxes will stop receiving emails."))
      return;

    await fetch(`/api/admin/domains?id=${id}`, { method: "DELETE" });
    fetchDomains();
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-brand-md">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Manage Domains</h1>
          <p className="text-surface-500 text-sm mt-0.5">
            Add <span className="font-semibold text-brand-600">public</span> or{" "}
            <span className="font-semibold text-purple-600">private</span> domains for your platform
          </p>
        </div>
      </div>

      {/* Add domain form */}
      <div className="card p-6">
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="e.g. domain1.com"
              className="input-field flex-1 min-w-[200px] !rounded-xl"
              required
            />
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="input-field !w-auto !rounded-xl !pr-8"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary !rounded-xl !px-6 flex items-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              )}
              Add Domain
            </button>
          </div>
          <p className="text-xs text-surface-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {visibility === "public"
              ? "Public — any registered user can create mailboxes on this domain."
              : "Private — only you (admin) can create mailboxes on this domain."}
          </p>
        </form>
        {error && (
          <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200/50 rounded-xl text-sm text-red-600">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}
      </div>

      {/* Domains table */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[750px]">
          <thead>
            <tr className="border-b border-surface-100">
              <th className="px-6 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Domain</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Owner</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Verified</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-4 text-right text-xs font-bold text-surface-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d._id} className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                    </div>
                    <span className="font-semibold text-surface-800">{d.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleVisibilityToggle(d._id, d.visibility)}
                    title={`Click to make ${d.visibility === "public" ? "Private" : "Public"}`}
                    className={`cursor-pointer transition-all hover:scale-105 ${
                      d.visibility === "public" ? "badge-brand" : "badge-purple"
                    }`}
                  >
                    {d.visibility === "public" ? "Public" : "Private"}
                  </button>
                </td>
                <td className="px-6 py-4 text-surface-500 text-xs">
                  {d.ownerId?.name || "—"}
                </td>
                <td className="px-6 py-4">
                  {(() => {
                    const vs = d.verificationStatus || "pending";
                    const map = {
                      pending: "badge-warning",
                      verified: "badge-success",
                      failed: "badge-danger",
                    };
                    return (
                      <span className={map[vs]}>
                        {vs.charAt(0).toUpperCase() + vs.slice(1)}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4">
                  <span className={d.isActive ? "badge-success" : "badge-danger"}>
                    {d.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 text-surface-400 text-xs">
                  {new Date(d.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleToggle(d._id, d.isActive)}
                      className="btn-ghost !text-xs !py-1.5 !px-3 !rounded-lg"
                    >
                      {d.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDelete(d._id)}
                      className="btn-danger !text-xs !py-1.5 !px-3 !rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {domains.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-surface-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                  </div>
                  <p className="text-sm font-medium text-surface-500">No domains added yet</p>
                  <p className="text-xs text-surface-400 mt-1">Add your first domain above</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
