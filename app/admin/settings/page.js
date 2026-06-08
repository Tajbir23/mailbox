"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const VISIBILITY_OPTIONS = [
  {
    value: "public",
    title: "Public",
    desc: "Anyone can view (even logged out)",
  },
  {
    value: "authenticated",
    title: "Logged-in users",
    desc: "Any signed-in user",
  },
  {
    value: "admin",
    title: "Admins only",
    desc: "Only administrators",
  },
  {
    value: "disabled",
    title: "Disabled",
    desc: "Nobody can view",
  },
];

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [settings, setSettings] = useState({ docs_visibility: "public" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, ...data }));
      } else {
        setError("Failed to load settings");
      }
    } catch {
      setError("Failed to load settings");
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
      fetchSettings().finally(() => setLoading(false));
    }
  }, [status, session, router, fetchSettings]);

  async function updateSetting(key, value) {
    // Optimistic update
    const previous = settings[key];
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, [data.key]: data.value }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const data = await res.json().catch(() => ({}));
        setSettings((prev) => ({ ...prev, [key]: previous }));
        setError(data.error || "Failed to save setting");
      }
    } catch {
      setSettings((prev) => ({ ...prev, [key]: previous }));
      setError("Failed to save setting");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          </svg>
        </div>
      </div>
    );
  }

  const docsVisibility = settings.docs_visibility;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-brand-md">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Settings</h1>
            <p className="text-sm text-surface-500">Control platform-wide configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="btn-ghost !rounded-xl !text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
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

      {/* Documentation Visibility Card */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center ring-1 ring-brand-100 shrink-0">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-surface-900">Documentation Visibility</h2>
              <p className="text-sm text-surface-500">Control who can view the SSO documentation page</p>
            </div>
          </div>

          {/* Saved indicator */}
          {saved && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 animate-fade-in">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </div>
          )}
          {saving && !saved && (
            <span className="text-xs text-surface-400 font-medium">Saving…</span>
          )}
        </div>

        {/* Option cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {VISIBILITY_OPTIONS.map((opt) => {
            const selected = docsVisibility === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => !selected && updateSetting("docs_visibility", opt.value)}
                disabled={saving}
                className={`text-left p-4 rounded-xl border-2 transition-all disabled:opacity-70 ${
                  selected
                    ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-100"
                    : "border-surface-200 hover:border-surface-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-surface-800">{opt.title}</span>
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selected ? "border-brand-500" : "border-surface-300"
                    }`}
                  >
                    {selected && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                  </span>
                </div>
                <p className="text-xs text-surface-500 leading-snug">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Docs link */}
        <div className="mt-5 pt-5 border-t border-surface-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-surface-50 border border-surface-100">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-surface-800">SSO Documentation</p>
              <code className="text-xs text-surface-500 font-mono break-all">/docs/sso</code>
            </div>
            <Link
              href="/docs/sso"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost !rounded-xl !text-sm flex items-center gap-2 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open docs page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
