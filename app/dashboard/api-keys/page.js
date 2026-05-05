"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ApiKeysPage() {
  const { status } = useSession();
  const router = useRouter();

  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") loadKeys();
  }, [status, router]);

  async function loadKeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/user/api-keys");
      const data = await res.json();
      if (Array.isArray(data)) setKeys(data);
    } finally {
      setLoading(false);
    }
  }

  async function createKey(e) {
    e.preventDefault();
    setMsg({ type: "", text: "" });
    setCreating(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresAt: expiresAt || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to create key" });
        return;
      }
      setNewKey(data);
      setName("");
      setExpiresAt("");
      loadKeys();
    } catch {
      setMsg({ type: "error", text: "Network error" });
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id) {
    if (!confirm("Revoke this API key? Apps using it will stop working immediately.")) return;
    const res = await fetch(`/api/user/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((k) => k.filter((x) => x._id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg({ type: "error", text: data.error || "Failed to revoke" });
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  if (status !== "authenticated") {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-surface-500 hover:text-brand-600 inline-flex items-center gap-1 mb-3"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to dashboard
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="section-title">API keys</h1>
            <p className="section-subtitle">
              Programmatic access to your mailboxes, emails and domains.
            </p>
          </div>
          <Link href="/docs/api" className="btn-secondary py-2 px-4 text-sm">
            View docs →
          </Link>
        </div>
      </div>

      {newKey && (
        <div className="card p-6 border-2 border-brand-500/40 bg-brand-50/40">
          <h2 className="text-lg font-semibold text-surface-900 mb-1">
            Save this key now — it will not be shown again
          </h2>
          <p className="text-sm text-surface-600 mb-4">
            Store it in a password manager or secrets file. Anyone with this key can act as you.
          </p>
          <div className="flex items-center gap-2 bg-surface-900 text-emerald-300 font-mono text-sm rounded-xl px-4 py-3 break-all">
            <code className="flex-1">{newKey.key}</code>
            <button
              onClick={() => copy(newKey.key)}
              className="text-xs px-2 py-1 rounded-md bg-surface-700 hover:bg-surface-600 text-white shrink-0"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="btn-secondary mt-4 py-2 px-4 text-sm"
          >
            I saved it, dismiss
          </button>
        </div>
      )}

      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-surface-900 mb-1">Create new key</h2>
        <p className="text-sm text-surface-500 mb-6">
          Give the key a label so you can recognise it later.
        </p>
        <form onSubmit={createKey} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="e.g. CI bot, my laptop, zapier"
              maxLength={80}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Expires <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input-field"
            />
          </div>
          {msg.text && (
            <div
              className={`px-4 py-3 rounded-xl text-sm border ${
                msg.type === "error"
                  ? "bg-red-50 border-red-100 text-red-700"
                  : "bg-emerald-50 border-emerald-100 text-emerald-700"
              }`}
            >
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={creating} className="btn-primary py-2.5 px-5 text-sm">
            {creating ? "Creating…" : "Create API key"}
          </button>
        </form>
      </div>

      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-surface-900 mb-4">Your keys</h2>
        {loading ? (
          <p className="text-sm text-surface-500">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-surface-500">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-surface-100">
            {keys.map((k) => (
              <li key={k._id} className="py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-surface-900 truncate">{k.name}</div>
                  <div className="text-xs text-surface-500 font-mono mt-0.5">
                    {k.keyPrefix}…
                  </div>
                  <div className="text-xs text-surface-400 mt-1">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && (
                      <> · Last used {new Date(k.lastUsedAt).toLocaleDateString()}</>
                    )}
                    {k.expiresAt && (
                      <> · Expires {new Date(k.expiresAt).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => revokeKey(k._id)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
