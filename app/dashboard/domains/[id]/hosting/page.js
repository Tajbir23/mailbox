"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";

export default function DomainHostingSetupPage() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/user/domains/${id}/hosting`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed to load");
        } else {
          setData(json);
        }
      } catch {
        setError("Failed to load");
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast?.success?.("Copied to clipboard");
    } catch {
      toast?.error?.("Could not copy");
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-surface-500">Loading hosting setup…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="card p-6">
          <h1 className="text-lg font-bold text-red-600 mb-2">Unable to load</h1>
          <p className="text-sm text-surface-500 mb-4">{error}</p>
          <Link href="/dashboard" className="text-brand-600 text-sm font-medium hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const approved = data.websiteStatus === "approved";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <Link href="/dashboard" className="text-xs text-surface-500 hover:text-brand-600">
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-surface-900 mt-2">
          Configure <span className="text-brand-600">{data.domain}</span>
        </h1>
        <p className="text-sm text-surface-500 mt-1">
          Point your domain to our hosting server using the records below.
        </p>
      </div>

      {!approved && (
        <div className="card p-4 bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700 font-medium">
            Hosting status: {data.websiteStatus || "not requested"}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            These instructions will only take effect once your hosting request is approved.
          </p>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-base font-bold text-surface-900 mb-1">Step 1 — Open your registrar</h2>
        <p className="text-sm text-surface-500 mb-4">
          Sign in where you bought <strong>{data.domain}</strong> (Namecheap, GoDaddy, Cloudflare,
          etc.) and open the <strong>DNS settings</strong> for the domain.
        </p>

        <h2 className="text-base font-bold text-surface-900 mb-1">Step 2 — Add these A records</h2>
        <p className="text-sm text-surface-500 mb-4">
          Remove any existing A records on <code>@</code> and <code>www</code> first to avoid
          conflicts.
        </p>

        <div className="overflow-x-auto rounded-xl border border-surface-200">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs uppercase text-surface-500">
              <tr>
                <th className="text-left px-4 py-2.5">Type</th>
                <th className="text-left px-4 py-2.5">Host</th>
                <th className="text-left px-4 py-2.5">Value</th>
                <th className="text-left px-4 py-2.5">TTL</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {data.records.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-mono text-xs">{r.type}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.host}</td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-600">{r.value}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.ttl}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => copy(r.value)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-base font-bold text-surface-900 mt-6 mb-1">Step 3 — Wait for DNS to propagate</h2>
        <p className="text-sm text-surface-500">
          DNS changes typically take 5–30 minutes but can take up to 24 hours. Once the records
          resolve, your website will be served automatically — no further action needed.
        </p>
      </div>

      <div className="card p-6 bg-surface-50/50">
        <h3 className="text-sm font-bold text-surface-800 mb-2">Quick reference</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-surface-500">Server IP:</span>
          <code className="bg-white px-2 py-1 rounded border border-surface-200 text-brand-600 font-mono">
            {data.hostingIp}
          </code>
          <button
            onClick={() => copy(data.hostingIp)}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
