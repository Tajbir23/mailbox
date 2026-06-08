"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now - date) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function OAuthClientsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [clients, setClients] = useState([]);
  const [authorizations, setAuthorizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Register form state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    display_name: "",
    redirect_uris: "",
    allowed_scopes: ["openid", "profile", "email"],
    client_type: "confidential",
  });
  const [registering, setRegistering] = useState(false);

  // Secret display modal
  const [newClientSecret, setNewClientSecret] = useState(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // Edit state
  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({
    display_name: "",
    redirect_uris: "",
    allowed_scopes: [],
    active: true,
  });
  const [saving, setSaving] = useState(false);

  // Confirm delete
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/oauth-clients");
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
      }
    } catch {
      setError("Failed to fetch clients");
    }
  }, []);

  const fetchAuthorizations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/oauth-clients/authorizations");
      if (res.ok) {
        const data = await res.json();
        setAuthorizations(data.authorizations);
      }
    } catch {
      setError("Failed to fetch authorizations");
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
      Promise.all([fetchClients(), fetchAuthorizations()]).finally(() =>
        setLoading(false)
      );
    }
  }, [status, session, router, fetchClients, fetchAuthorizations]);

  // Register new client
  async function handleRegister(e) {
    e.preventDefault();
    setRegistering(true);
    setError("");

    const uris = registerForm.redirect_uris
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/admin/oauth-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: registerForm.display_name,
          redirect_uris: uris,
          allowed_scopes: registerForm.allowed_scopes,
          client_type: registerForm.client_type,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNewClientSecret({
          client_id: data.client.client_id,
          client_secret: data.client.client_secret,
        });
        setShowRegisterForm(false);
        setRegisterForm({
          display_name: "",
          redirect_uris: "",
          allowed_scopes: ["openid", "profile", "email"],
          client_type: "confidential",
        });
        fetchClients();
      } else {
        setError(data.error || "Failed to register client");
      }
    } catch {
      setError("Failed to register client");
    } finally {
      setRegistering(false);
    }
  }

  // Edit client
  function startEdit(client) {
    setEditingClient(client._id);
    setEditForm({
      display_name: client.display_name,
      redirect_uris: (client.redirect_uris || []).join("\n"),
      allowed_scopes: client.allowed_scopes || [],
      active: client.active,
    });
  }

  async function handleSaveEdit() {
    setSaving(true);
    setError("");

    const uris = editForm.redirect_uris
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/admin/oauth-clients/${editingClient}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: editForm.display_name,
          redirect_uris: uris,
          allowed_scopes: editForm.allowed_scopes,
          active: editForm.active,
        }),
      });

      if (res.ok) {
        setEditingClient(null);
        fetchClients();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update client");
      }
    } catch {
      setError("Failed to update client");
    } finally {
      setSaving(false);
    }
  }

  // Delete client
  async function handleDelete(clientId) {
    try {
      const res = await fetch(`/api/admin/oauth-clients/${clientId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchClients();
        fetchAuthorizations();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete client");
      }
    } catch {
      setError("Failed to delete client");
    }
  }

  // Regenerate secret
  async function handleRegenerateSecret(clientId) {
    if (!confirm("Are you sure? The old secret will be permanently invalidated.")) return;

    try {
      const res = await fetch(
        `/api/admin/oauth-clients/${clientId}/regenerate-secret`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok) {
        setNewClientSecret({
          client_id: data.client_id,
          client_secret: data.client_secret,
        });
      } else {
        setError(data.error || "Failed to regenerate secret");
      }
    } catch {
      setError("Failed to regenerate secret");
    }
  }

  // Revoke authorization
  async function handleRevokeAuth(userId, clientId) {
    if (!confirm("Revoke this authorization? All tokens for this user-client pair will be invalidated.")) return;

    try {
      const res = await fetch(
        `/api/admin/oauth-clients/authorizations?user_id=${userId}&client_id=${clientId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchAuthorizations();
        fetchClients();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to revoke authorization");
      }
    } catch {
      setError("Failed to revoke authorization");
    }
  }

  // Copy to clipboard
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  }

  // Toggle scope in form
  function toggleScope(scope, formSetter, currentScopes) {
    if (currentScopes.includes(scope)) {
      formSetter((prev) => ({
        ...prev,
        allowed_scopes: prev.allowed_scopes.filter((s) => s !== scope),
      }));
    } else {
      formSetter((prev) => ({
        ...prev,
        allowed_scopes: [...prev.allowed_scopes, scope],
      }));
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-brand-md">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">OAuth Clients</h1>
            <p className="text-sm text-surface-500">Manage SSO client applications</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="btn-ghost !rounded-xl !text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
          <button
            onClick={() => setShowRegisterForm(true)}
            className="btn-primary !rounded-xl !text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Register New Client
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Secret Display Modal */}
      {newClientSecret && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-surface-900">Client Secret</h3>
                <p className="text-xs text-amber-600 font-medium">This will only be shown once!</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-surface-500">Client ID</label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="text-sm bg-surface-100 px-3 py-2 rounded-lg font-mono flex-1 break-all">
                    {newClientSecret.client_id}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newClientSecret.client_id)}
                    className="btn-ghost !p-2 !rounded-lg shrink-0"
                    title="Copy Client ID"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-surface-500">Client Secret</label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="text-sm bg-surface-100 px-3 py-2 rounded-lg font-mono flex-1 break-all">
                    {newClientSecret.client_secret}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newClientSecret.client_secret)}
                    className="btn-ghost !p-2 !rounded-lg shrink-0"
                    title="Copy Client Secret"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {secretCopied && (
              <p className="text-sm text-emerald-600 font-medium">Copied to clipboard!</p>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-700">
                ⚠️ Store this secret securely. It cannot be retrieved after closing this dialog.
              </p>
            </div>

            <button
              onClick={() => {
                setNewClientSecret(null);
                setSecretCopied(false);
              }}
              className="btn-primary w-full !rounded-xl"
            >
              I&apos;ve saved the secret
            </button>
          </div>
        </div>
      )}

      {/* Register Form Modal */}
      {showRegisterForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-surface-900">Register New Client</h3>
              <button onClick={() => setShowRegisterForm(false)} className="btn-ghost !p-2 !rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-surface-700">Display Name</label>
                <input
                  type="text"
                  value={registerForm.display_name}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  className="input mt-1"
                  placeholder="My Application"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-surface-700">Redirect URIs</label>
                <p className="text-xs text-surface-400 mb-1">One URI per line</p>
                <textarea
                  value={registerForm.redirect_uris}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, redirect_uris: e.target.value }))}
                  className="input mt-1 min-h-[80px] font-mono text-sm"
                  placeholder={"https://myapp.com/callback\nhttps://myapp.com/auth/callback"}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-surface-700">Client Type</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="client_type"
                      value="confidential"
                      checked={registerForm.client_type === "confidential"}
                      onChange={(e) => setRegisterForm((prev) => ({ ...prev, client_type: e.target.value }))}
                      className="text-brand-500"
                    />
                    <span className="text-sm text-surface-700">Confidential</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="client_type"
                      value="public"
                      checked={registerForm.client_type === "public"}
                      onChange={(e) => setRegisterForm((prev) => ({ ...prev, client_type: e.target.value }))}
                      className="text-brand-500"
                    />
                    <span className="text-sm text-surface-700">Public</span>
                  </label>
                </div>
                <p className="text-xs text-surface-400 mt-1">
                  Confidential clients can securely store secrets (server-side apps). Public clients cannot (SPAs, mobile).
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-surface-700">Allowed Scopes</label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {["openid", "profile", "email", "offline_access"].map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={registerForm.allowed_scopes.includes(scope)}
                        onChange={() => toggleScope(scope, setRegisterForm, registerForm.allowed_scopes)}
                        className="text-brand-500 rounded"
                      />
                      <span className="text-sm text-surface-700">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterForm(false)}
                  className="btn-ghost flex-1 !rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="btn-primary flex-1 !rounded-xl"
                >
                  {registering ? "Registering..." : "Register Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-surface-900">Edit Client</h3>
              <button onClick={() => setEditingClient(null)} className="btn-ghost !p-2 !rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-surface-700">Display Name</label>
                <input
                  type="text"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  className="input mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-surface-700">Redirect URIs</label>
                <p className="text-xs text-surface-400 mb-1">One URI per line</p>
                <textarea
                  value={editForm.redirect_uris}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, redirect_uris: e.target.value }))}
                  className="input mt-1 min-h-[80px] font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-surface-700">Allowed Scopes</label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {["openid", "profile", "email", "offline_access"].map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.allowed_scopes.includes(scope)}
                        onChange={() => toggleScope(scope, setEditForm, editForm.allowed_scopes)}
                        className="text-brand-500 rounded"
                      />
                      <span className="text-sm text-surface-700">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, active: e.target.checked }))}
                    className="text-brand-500 rounded"
                  />
                  <span className="text-sm font-medium text-surface-700">Active</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="btn-ghost flex-1 !rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="btn-primary flex-1 !rounded-xl"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-surface-900">Delete Client</h3>
                <p className="text-xs text-surface-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-surface-600">
              Are you sure you want to deactivate <strong>{deleteConfirm.display_name}</strong>? All active tokens will be revoked and all user authorizations removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn-ghost flex-1 !rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm._id)}
                className="flex-1 !rounded-xl px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clients Table */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-surface-800">Registered Clients</h3>
          <span className="ml-auto text-xs text-surface-400">{clients.length} total</span>
        </div>

        {clients.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">
            No OAuth clients registered yet. Click &ldquo;Register New Client&rdquo; to get started.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Display Name</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Client ID</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Type</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Status</th>
                  <th className="text-center py-2 px-3 text-xs font-bold text-surface-500 uppercase">Authorizations</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Created</th>
                  <th className="text-right py-2 px-3 text-xs font-bold text-surface-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client._id} className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-medium text-surface-800">{client.display_name}</span>
                    </td>
                    <td className="py-3 px-3">
                      <code className="text-xs bg-surface-100 px-2 py-1 rounded font-mono text-surface-600">
                        {client.client_id?.substring(0, 12)}...
                      </code>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-surface-600 capitalize">{client.client_type}</span>
                    </td>
                    <td className="py-3 px-3">
                      {client.active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 ring-1 ring-red-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-sm font-bold text-surface-800">{client.activeAuthorizations || 0}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-surface-500">{timeAgo(client.createdAt)}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(client)}
                          className="btn-ghost !p-1.5 !rounded-lg"
                          title="Edit"
                        >
                          <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleRegenerateSecret(client._id)}
                          className="btn-ghost !p-1.5 !rounded-lg"
                          title="Regenerate Secret"
                        >
                          <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(client)}
                          className="btn-ghost !p-1.5 !rounded-lg"
                          title="Delete"
                        >
                          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Authorizations */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-surface-800">Active Authorizations</h3>
          <span className="ml-auto text-xs text-surface-400">{authorizations.length} total</span>
        </div>

        {authorizations.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">
            No active authorizations. Users will appear here after granting consent to OAuth clients.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">User</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Client ID</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Scopes</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Granted</th>
                  <th className="text-right py-2 px-3 text-xs font-bold text-surface-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {authorizations.map((auth, i) => (
                  <tr key={i} className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {auth.user?.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-surface-700 truncate">{auth.user?.name || "Unknown"}</p>
                          <p className="text-xs text-surface-400 truncate">{auth.user?.email || "Unknown"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <code className="text-xs bg-surface-100 px-2 py-1 rounded font-mono text-surface-600">
                        {auth.client_id?.substring(0, 12)}...
                      </code>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(auth.granted_scopes || []).map((scope) => (
                          <span key={scope} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-surface-500">{timeAgo(auth.granted_at)}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleRevokeAuth(auth.user_id, auth.client_id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors ring-1 ring-red-200"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728l-12.728-12.728" />
                        </svg>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
