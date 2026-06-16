"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";

export default function DomainSetupPage() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/user/domains/${id}/hosting`);
      const json = await res.json();
      if (!res.ok) setError(json.error || "Failed to load");
      else setData(json);
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast?.success?.("Copied to clipboard");
    } catch {
      toast?.error?.("Could not copy");
    }
  };

  const verifyNow = async () => {
    setVerifying(true);
    try {
      const res = await fetch(`/api/user/domains/${id}/verify`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast?.error?.(json.error || "Verification failed");
      } else if (json.verificationStatus === "verified") {
        toast?.success?.("Domain verified!");
      } else {
        const firstErr = json.results?.errors?.[0];
        toast?.info?.(firstErr || "Records not found yet — DNS can take a few minutes.");
      }
      await load();
    } catch {
      toast?.error?.("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-surface-500">Loading domain setup…</div>;
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

  const approved = data.approved || data.websiteStatus === "approved";
  const verified = data.verificationStatus === "verified";
  const setup = data.setup || { groups: [], ptr: null };

  const statusBadge = (ok, label, warnLabel) =>
    ok ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
        {label}
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        {warnLabel}
      </span>
    );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <Link href="/dashboard" className="text-xs text-surface-500 hover:text-brand-600">
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-surface-900 mt-2">
          Set up <span className="text-brand-600">{data.domain}</span>
        </h1>
        <p className="text-sm text-surface-500 mt-1">
          Add the DNS records below at your domain registrar. Each record shows exactly
          where it goes and what it does.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {statusBadge(verified, "Ownership verified", "Ownership pending")}
          {statusBadge(approved, "Approved by admin", "Awaiting admin approval")}
        </div>
      </div>

      {/* Approval gate banner */}
      {!approved && (
        <div className="card p-4 bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-800 font-medium">Awaiting admin approval</p>
          <p className="text-xs text-amber-700 mt-1">
            You can add these DNS records now, but full configuration (public mailboxes +
            website hosting/SSL) activates once an admin approves this domain. You&apos;ll get a
            notification when it&apos;s approved.
          </p>
        </div>
      )}

      {/* Quick reference */}
      <div className="card p-5 bg-surface-50/60">
        <h3 className="text-sm font-bold text-surface-800 mb-3">Quick reference</h3>
        <dl className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-surface-400 uppercase tracking-wide">Mail server</dt>
            <dd className="font-mono text-brand-600 break-all">{data.mailHostname}</dd>
          </div>
          <div>
            <dt className="text-xs text-surface-400 uppercase tracking-wide">Server IP</dt>
            <dd className="font-mono text-brand-600 break-all">{data.hostingIp || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-surface-400 uppercase tracking-wide">DKIM</dt>
            <dd className="font-mono text-surface-600">{data.dkimConfigured ? "Enabled" : "Not set"}</dd>
          </div>
        </dl>
      </div>

      {/* Record groups */}
      {setup.groups.map((group) => (
        <div key={group.id} className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold text-surface-900">{group.title}</h2>
            {group.required && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                Required
              </span>
            )}
          </div>
          <p className="text-sm text-surface-500 mb-4">{group.where}</p>

          <div className="overflow-x-auto rounded-xl border border-surface-200">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-xs uppercase text-surface-500">
                <tr>
                  <th className="text-left px-3 py-2.5">Type</th>
                  <th className="text-left px-3 py-2.5">Host / Name</th>
                  <th className="text-left px-3 py-2.5">Value</th>
                  <th className="text-left px-3 py-2.5">TTL</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {group.records.map((r, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                      {r.type}
                      {typeof r.priority === "number" && (
                        <span className="block text-surface-400">prio {r.priority}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                      {r.host}
                      {r.fqdn && r.host !== r.fqdn && (
                        <span className="block text-surface-400">{r.fqdn}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs text-brand-600 break-all">{r.value}</div>
                      <div className="text-[11px] text-surface-400 mt-1">{r.purpose}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{r.ttl}</td>
                    <td className="px-3 py-3 text-right">
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

          {group.id === "verify" && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={verifyNow}
                disabled={verifying}
                className="btn-primary !text-sm !py-2 !px-4 !rounded-xl disabled:opacity-50"
              >
                {verifying ? "Checking DNS…" : "Verify now"}
              </button>
              <span className="text-xs text-surface-400">
                DNS changes can take 5–30 minutes (up to 24h) to propagate.
              </span>
            </div>
          )}
        </div>
      ))}

      {/* PTR guidance */}
      {setup.ptr && (
        <div className="card p-5 bg-surface-50/50">
          <h3 className="text-sm font-bold text-surface-800 mb-1">{setup.ptr.title}</h3>
          <p className="text-sm text-surface-500">{setup.ptr.note}</p>
        </div>
      )}

      <div className="card p-5 border border-brand-100 bg-brand-50/40">
        <h3 className="text-sm font-bold text-surface-800 mb-1">After adding the records</h3>
        <ol className="text-sm text-surface-600 list-decimal list-inside space-y-1">
          <li>Click <strong>Verify now</strong> above once the ownership records are added.</li>
          <li>
            Once verified, create mailboxes on this domain from{" "}
            <Link href="/dashboard/mailboxes" className="text-brand-600 hover:underline">
              Mailboxes
            </Link>
            .
          </li>
          <li>Send mail from your mailbox to anyone — Gmail, Outlook, etc.</li>
        </ol>
      </div>
    </div>
  );
}
