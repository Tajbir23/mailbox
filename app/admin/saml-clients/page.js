"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const NAMEID_FORMATS = [
  { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress", label: "Email Address" },
  { value: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent", label: "Persistent" },
  { value: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient", label: "Transient" },
  { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified", label: "Unspecified" },
];

const DEFAULT_NAMEID = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
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

// Build acs_urls array from a textarea value (one URL per line, trimmed, non-empty).
function parseAcsUrls(text) {
  return text
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
}

// Build attribute_mapping object only from non-empty mapping fields (omit if all empty).
function buildAttributeMapping(mapping) {
  const result = {};
  for (const key of ["email", "givenName", "surname"]) {
    const val = (mapping[key] || "").trim();
    if (val) result[key] = val;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

const EMPTY_MAPPING = { email: "", givenName: "", surname: "" };

export default function SAMLClientsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Metadata URL (computed client-side to avoid SSR mismatch)
  const [metadataUrl, setMetadataUrl] = useState("");
  const [metadataCopied, setMetadataCopied] = useState(false);

  // Register form state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    display_name: "",
    sp_entity_id: "",
    acs_urls: "",
    default_acs_url: "",
    nameid_format: DEFAULT_NAMEID,
    attribute_mapping: { ...EMPTY_MAPPING },
  });
  const [registering, setRegistering] = useState(false);

  // Edit state
  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({
    display_name: "",
    sp_entity_id: "",
    acs_urls: "",
    default_acs_url: "",
    nameid_format: DEFAULT_NAMEID,
    attribute_mapping: { ...EMPTY_MAPPING },
    active: true,
  });
  const [saving, setSaving] = useState(false);

  // Confirm delete
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/saml-clients");
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      } else {
        setError("Failed to fetch service providers");
      }
    } catch {
      setError("Failed to fetch service providers");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMetadataUrl(`${window.location.origin}/api/saml/metadata`);
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
      fetchClients().finally(() => setLoading(false));
    }
  }, [status, session, router, fetchClients]);

  // Register new SP
  async function handleRegister(e) {
    e.preventDefault();
    setRegistering(true);
    setError("");

    const acs_urls = parseAcsUrls(registerForm.acs_urls);
    const attribute_mapping = buildAttributeMapping(registerForm.attribute_mapping);

    const body = {
      display_name: registerForm.display_name,
      sp_entity_id: registerForm.sp_entity_id,
      acs_urls,
      default_acs_url: registerForm.default_acs_url.trim() || undefined,
      nameid_format: registerForm.nameid_format,
    };
    if (attribute_mapping) body.attribute_mapping = attribute_mapping;

    try {
      const res = await fetch("/api/admin/saml-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setShowRegisterForm(false);
        setRegisterForm({
          display_name: "",
          sp_entity_id: "",
          acs_urls: "",
          default_acs_url: "",
          nameid_format: DEFAULT_NAMEID,
          attribute_mapping: { ...EMPTY_MAPPING },
        });
        fetchClients();
      } else {
        setError(data.error || "Failed to register service provider");
      }
    } catch {
      setError("Failed to register service provider");
    } finally {
      setRegistering(false);
    }
  }

  // Start editing an SP
  function startEdit(client) {
    setEditingClient(client._id);
    const mapping = client.attribute_mapping || {};
    setEditForm({
      display_name: client.display_name || "",
      sp_entity_id: client.sp_entity_id || "",
      acs_urls: (client.acs_urls || []).join("\n"),
      default_acs_url: client.default_acs_url || "",
      nameid_format: client.nameid_format || DEFAULT_NAMEID,
      attribute_mapping: {
        email: mapping.email || "",
        givenName: mapping.givenName || "",
        surname: mapping.surname || "",
      },
      active: client.active,
    });
  }

  async function handleSaveEdit() {
    setSaving(true);
    setError("");

    const acs_urls = parseAcsUrls(editForm.acs_urls);
    const attribute_mapping = buildAttributeMapping(editForm.attribute_mapping);

    const body = {
      display_name: editForm.display_name,
      sp_entity_id: editForm.sp_entity_id,
      acs_urls,
      default_acs_url: editForm.default_acs_url.trim() || null,
      nameid_format: editForm.nameid_format,
      attribute_mapping: attribute_mapping || null,
      active: editForm.active,
    };

    try {
      const res = await fetch(`/api/admin/saml-clients/${editingClient}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditingClient(null);
        fetchClients();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update service provider");
      }
    } catch {
      setError("Failed to update service provider");
    } finally {
      setSaving(false);
    }
  }

  // Delete SP
  async function handleDelete(clientId) {
    try {
      const res = await fetch(`/api/admin/saml-clients/${clientId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchClients();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete service provider");
      }
    } catch {
      setError("Failed to delete service provider");
    }
  }

  function copyMetadata() {
    navigator.clipboard.writeText(metadataUrl);
    setMetadataCopied(true);
    setTimeout(() => setMetadataCopied(false), 2000);
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">SAML Service Providers</h1>
            <p className="text-sm text-surface-500">Manage SAML SSO integrations and the IdP metadata</p>
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
            Register New SP
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

      {/* IdP Metadata URL */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656m-3.656 0a4 4 0 010-5.656m-2.828 8.485a8 8 0 010-11.314m17.656 0a8 8 0 010 11.314M9 12a3 3 0 116 0 3 3 0 01-6 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-surface-800">IdP Metadata</h3>
          <span className="ml-auto text-xs text-surface-400">For this domain</span>
        </div>

        <div>
          <label className="text-xs font-medium text-surface-500">Metadata URL</label>
          <div className="mt-1 flex items-center gap-2">
            <code className="text-sm bg-surface-100 px-3 py-2 rounded-lg font-mono flex-1 break-all text-surface-700">
              {metadataUrl || "—"}
            </code>
            <button
              onClick={copyMetadata}
              disabled={!metadataUrl}
              className="btn-ghost !p-2 !rounded-lg shrink-0"
              title="Copy Metadata URL"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          {metadataCopied && (
            <p className="text-xs text-emerald-600 font-medium mt-1.5">Copied to clipboard!</p>
          )}
          <p className="text-xs text-surface-400 mt-2">
            Provide this URL to your Service Provider (e.g. ChatGPT) to configure the IdP. The IdP{" "}
            <span className="font-medium text-surface-500">entityID</span> is the same URL:{" "}
            <code className="font-mono text-surface-500">{metadataUrl || "—"}</code>
          </p>
        </div>
      </div>

      {/* Register Form Modal */}
      {showRegisterForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-0">
            {/* Modal header */}
            <div className="flex items-center gap-3 p-6 border-b border-surface-100">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-brand-md shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-surface-900">Register New SP</h3>
                <p className="text-xs text-surface-500">Add a SAML Service Provider integration</p>
              </div>
              <button
                onClick={() => setShowRegisterForm(false)}
                className="btn-ghost !p-2 !rounded-lg shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleRegister} className="p-6 space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={registerForm.display_name}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. ChatGPT, Salesforce, My SaaS"
                  required
                />
                <p className="text-xs text-surface-400 mt-1.5">A friendly name to identify this SP.</p>
              </div>

              {/* SP Entity ID */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">SP Entity ID</label>
                <input
                  type="text"
                  value={registerForm.sp_entity_id}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, sp_entity_id: e.target.value }))}
                  className="input-field font-mono text-sm"
                  placeholder="https://sp.example.com/saml/metadata"
                  required
                />
                <p className="text-xs text-surface-400 mt-1.5">The Service Provider&apos;s entityID (from ChatGPT/SP metadata).</p>
              </div>

              {/* ACS URLs */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">ACS URLs</label>
                <textarea
                  value={registerForm.acs_urls}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, acs_urls: e.target.value }))}
                  className="input-field min-h-[88px] font-mono text-sm leading-relaxed"
                  placeholder={"https://sp.example.com/saml/acs\nhttps://sp.example.com/auth/callback"}
                  required
                />
                <p className="text-xs text-surface-400 mt-1.5">
                  One Assertion Consumer Service URL per line. These are the allow-listed destinations for the SAML response.
                </p>
              </div>

              {/* Default ACS URL */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">
                  Default ACS URL <span className="text-surface-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={registerForm.default_acs_url}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, default_acs_url: e.target.value }))}
                  className="input-field font-mono text-sm"
                  placeholder="https://sp.example.com/saml/acs"
                />
                <p className="text-xs text-surface-400 mt-1.5">Used when the request omits an ACS URL.</p>
              </div>

              {/* NameID Format */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">NameID Format</label>
                <select
                  value={registerForm.nameid_format}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, nameid_format: e.target.value }))}
                  className="input-field"
                >
                  {NAMEID_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-surface-400 mt-1.5">The format of the Subject NameID in the assertion.</p>
              </div>

              {/* Attribute Mapping */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-2">
                  Attribute Mapping <span className="text-surface-400 font-normal">(optional)</span>
                </label>
                <div className="space-y-2">
                  {[
                    { key: "email", label: "Email", placeholder: "email" },
                    { key: "givenName", label: "Given Name", placeholder: "givenName" },
                    { key: "surname", label: "Surname", placeholder: "surname" },
                  ].map((field) => (
                    <div key={field.key} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-surface-500 w-24 shrink-0">{field.label}</span>
                      <input
                        type="text"
                        value={registerForm.attribute_mapping[field.key]}
                        onChange={(e) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            attribute_mapping: { ...prev.attribute_mapping, [field.key]: e.target.value },
                          }))
                        }
                        className="input-field !py-1.5 font-mono text-sm flex-1"
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-surface-400 mt-1.5">
                  Override the SP-facing attribute names. Leave blank to use defaults. Email is always included.
                </p>
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
                  {registering ? "Registering..." : "Register SP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-0">
            {/* Modal header */}
            <div className="flex items-center gap-3 p-6 border-b border-surface-100">
              <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-surface-900">Edit Service Provider</h3>
                <p className="text-xs text-surface-500">Update SAML SP configuration</p>
              </div>
              <button onClick={() => setEditingClient(null)} className="btn-ghost !p-2 !rounded-lg shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  className="input-field"
                />
              </div>

              {/* SP Entity ID */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">SP Entity ID</label>
                <input
                  type="text"
                  value={editForm.sp_entity_id}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, sp_entity_id: e.target.value }))}
                  className="input-field font-mono text-sm"
                />
                <p className="text-xs text-surface-400 mt-1.5">The Service Provider&apos;s entityID (from ChatGPT/SP metadata).</p>
              </div>

              {/* ACS URLs */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">ACS URLs</label>
                <textarea
                  value={editForm.acs_urls}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, acs_urls: e.target.value }))}
                  className="input-field min-h-[88px] font-mono text-sm leading-relaxed"
                />
                <p className="text-xs text-surface-400 mt-1.5">One Assertion Consumer Service URL per line.</p>
              </div>

              {/* Default ACS URL */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">
                  Default ACS URL <span className="text-surface-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={editForm.default_acs_url}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, default_acs_url: e.target.value }))}
                  className="input-field font-mono text-sm"
                />
                <p className="text-xs text-surface-400 mt-1.5">Used when the request omits an ACS URL.</p>
              </div>

              {/* NameID Format */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-1.5">NameID Format</label>
                <select
                  value={editForm.nameid_format}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, nameid_format: e.target.value }))}
                  className="input-field"
                >
                  {NAMEID_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Attribute Mapping */}
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-2">
                  Attribute Mapping <span className="text-surface-400 font-normal">(optional)</span>
                </label>
                <div className="space-y-2">
                  {[
                    { key: "email", label: "Email", placeholder: "email" },
                    { key: "givenName", label: "Given Name", placeholder: "givenName" },
                    { key: "surname", label: "Surname", placeholder: "surname" },
                  ].map((field) => (
                    <div key={field.key} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-surface-500 w-24 shrink-0">{field.label}</span>
                      <input
                        type="text"
                        value={editForm.attribute_mapping[field.key]}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            attribute_mapping: { ...prev.attribute_mapping, [field.key]: e.target.value },
                          }))
                        }
                        className="input-field !py-1.5 font-mono text-sm flex-1"
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-surface-400 mt-1.5">
                  Override the SP-facing attribute names. Leave blank to use defaults. Email is always included.
                </p>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-50 border border-surface-100">
                <div>
                  <p className="text-sm font-semibold text-surface-800">Active</p>
                  <p className="text-xs text-surface-500">Inactive SPs cannot receive SAML responses.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, active: !prev.active }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    editForm.active ? "bg-brand-500" : "bg-surface-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      editForm.active ? "translate-x-5" : ""
                    }`}
                  />
                </button>
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
                <h3 className="text-lg font-bold text-surface-900">Delete Service Provider</h3>
                <p className="text-xs text-surface-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-surface-600">
              Are you sure you want to delete <strong>{deleteConfirm.display_name}</strong>? The SP will no longer be able to receive SAML responses from this IdP.
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
                className="flex-1 !rounded-xl px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SP Table */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-surface-800">Registered Service Providers</h3>
          <span className="ml-auto text-xs text-surface-400">{clients.length} total</span>
        </div>

        {clients.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">
            No SAML service providers registered yet. Click &ldquo;Register New SP&rdquo; to get started.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Display Name</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">SP Entity ID</th>
                  <th className="text-center py-2 px-3 text-xs font-bold text-surface-500 uppercase">ACS URLs</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Status</th>
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
                      <code
                        className="text-xs bg-surface-100 px-2 py-1 rounded font-mono text-surface-600 inline-block max-w-[260px] truncate align-middle"
                        title={client.sp_entity_id}
                      >
                        {client.sp_entity_id}
                      </code>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-sm font-bold text-surface-800">{(client.acs_urls || []).length}</span>
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
    </div>
  );
}
