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

  const handleDelete = async (id) => {
    if (!confirm("Delete this domain? Existing mailboxes will stop receiving emails."))
      return;

    await fetch(`/api/admin/domains?id=${id}`, { method: "DELETE" });
    fetchDomains();
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Domains</h1>
        <p className="text-gray-500 text-sm mt-1">
          Add <span className="font-medium text-indigo-600">public</span> domains
          (any user can use) or <span className="font-medium text-purple-600">private</span> domains
          (only you can use).
        </p>
      </div>

      {/* Add domain form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="e.g. domain1.com"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition"
            >
              {loading ? "Adding…" : "Add Domain"}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            {visibility === "public"
              ? "Public — any registered user can create mailboxes on this domain."
              : "Private — only you (admin) can create mailboxes on this domain."}
          </p>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </p>
        )}
      </div>

      {/* Domains table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 text-left">Domain</th>
              <th className="px-6 py-3 text-left">Type</th>
              <th className="px-6 py-3 text-left">Owner</th>
              <th className="px-6 py-3 text-left">Verified</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Created</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {domains.map((d) => (
              <tr key={d._id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">
                  {d.name}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      d.visibility === "public"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {d.visibility === "public" ? "Public" : "Private"}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {d.ownerId?.name || "—"}
                </td>
                <td className="px-6 py-4">
                  {(() => {
                    const vs = d.verificationStatus || "pending";
                    const map = {
                      pending: "bg-yellow-100 text-yellow-700",
                      verified: "bg-green-100 text-green-700",
                      failed: "bg-red-100 text-red-700",
                    };
                    return (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${map[vs]}`}>
                        {vs.charAt(0).toUpperCase() + vs.slice(1)}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      d.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {d.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {new Date(d.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button
                    onClick={() => handleToggle(d._id, d.isActive)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-md transition"
                  >
                    {d.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => handleDelete(d._id)}
                    className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-md transition"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {domains.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-gray-400"
                >
                  No domains added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
