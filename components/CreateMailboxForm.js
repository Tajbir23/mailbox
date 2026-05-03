"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

export default function CreateMailboxForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [domains, setDomains] = useState([]);
  const [prefix, setPrefix] = useState("");
  const [domainId, setDomainId] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => {
        setDomains(data);
        if (data.length > 0) setDomainId(data[0]._id);
      })
      .catch(() => toast.error("Failed to load domains"));
  }, [toast]);

  const reset = () => {
    setPrefix("");
    setIsPublic(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, domainId, isPublic }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create mailbox");
        return;
      }
      toast.success(`Created ${data.emailAddress}`);
      reset();
      setOpen(false);
      if (onCreated) onCreated(data);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  const selectedDomain = domains.find((d) => d._id === domainId);
  const publicDomains = domains.filter((d) => d.visibility === "public");
  const privateDomains = domains.filter((d) => d.visibility === "private");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card p-5 w-full text-left hover:border-brand-200 hover:shadow-soft-lg transition-all group flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shrink-0 shadow-brand-sm group-hover:scale-105 transition-transform">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-surface-800">New Mailbox</p>
          <p className="text-xs text-surface-400 mt-0.5">Create a new receiving address</p>
        </div>
        <svg className="w-4 h-4 text-surface-300 group-hover:text-brand-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="New Mailbox"
        description="Create a new receiving address on one of your domains."
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="btn-ghost text-sm py-2 px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-mailbox-form"
              disabled={loading || domains.length === 0}
              className="btn-primary text-sm py-2 px-4"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating…
                </span>
              ) : (
                "Create Mailbox"
              )}
            </button>
          </>
        }
      >
        <form id="create-mailbox-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="username"
              className="input-field flex-1 min-w-0 !rounded-xl"
              required
              autoFocus
            />
            <div className="flex items-center gap-2">
              <span className="text-surface-400 font-medium text-center hidden sm:block">@</span>
              <select
                value={domainId}
                onChange={(e) => setDomainId(e.target.value)}
                className="input-field w-full sm:w-auto sm:min-w-[160px] sm:max-w-[220px] truncate !rounded-xl"
              >
                {publicDomains.length > 0 && (
                  <optgroup label="Public Domains">
                    {publicDomains.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {privateDomains.length > 0 && (
                  <optgroup label="My Domains">
                    {privateDomains.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {domains.length === 0 && <option disabled>No domains available</option>}
              </select>
            </div>
          </div>

          {prefix && selectedDomain && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-brand-50/60 border border-brand-100 rounded-xl">
              <svg className="w-4 h-4 text-brand-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-mono text-brand-700">
                {prefix.toLowerCase()}@{selectedDomain.name}
              </span>
              {selectedDomain.visibility === "private" && (
                <span className="badge-purple text-[10px] py-0.5 px-1.5 ml-auto">Private</span>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 px-3 py-3 bg-surface-50/60 border border-surface-100 rounded-xl cursor-pointer hover:bg-surface-50 transition">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-500 cursor-pointer"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-surface-800 flex items-center gap-1.5">
                Public Access
                <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </p>
              <p className="text-xs text-surface-500 mt-0.5">
                Anyone can view this mailbox&apos;s emails from the home page without an account. Use only for disposable / shareable inboxes.
              </p>
            </div>
          </label>
        </form>
      </Modal>
    </>
  );
}
