"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useMemo } from "react";
import io from "socket.io-client";
import ShareModal from "./ShareModal";
import Modal from "@/components/Modal";
import MailboxTagModal from "@/components/MailboxTagModal";
import { useToast } from "@/components/Toast";
import { makeMatcher } from "@/lib/search";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function timeUntil(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date - now;
  if (diffMs <= 0) return "expiring...";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m left`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h left`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d left`;
}

// ── MailboxActions dropdown ──
function MailboxActions({ mb, onUpdate, onDelete, onManageTags }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null); // null | "transfer" | "expiry"
  const [transferEmail, setTransferEmail] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDelete = async () => {
    const ok = await toast.confirm({
      title: "Delete mailbox?",
      message: `"${mb.emailAddress}" and ALL its emails will be permanently deleted. This cannot be undone.`,
      confirmText: "Delete forever",
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/mailboxes/${mb._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDelete(mb._id);
      setOpen(false);
      toast.success("Mailbox deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete mailbox");
    } finally {
      setLoading(false);
    }
  };

  const openTransfer = () => {
    setOpen(false);
    setTransferEmail("");
    setModal("transfer");
  };

  const openExpiry = () => {
    setOpen(false);
    if (mb.expiresAt) {
      const d = new Date(mb.expiresAt);
      setExpiryDate(d.toISOString().slice(0, 10));
      setExpiryTime(d.toTimeString().slice(0, 5));
    } else {
      setExpiryDate("");
      setExpiryTime("");
    }
    setModal("expiry");
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/mailboxes/${mb._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", newOwnerEmail: transferEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate();
      setModal(null);
      setTransferEmail("");
      toast.success(`Mailbox transferred to ${transferEmail}`);
    } catch (err) {
      toast.error(err.message || "Failed to transfer mailbox");
    } finally {
      setLoading(false);
    }
  };

  const handleExpiry = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const expiresAt = expiryDate && expiryTime
        ? new Date(`${expiryDate}T${expiryTime}`).toISOString()
        : expiryDate
        ? new Date(`${expiryDate}T23:59:59`).toISOString()
        : null;
      const res = await fetch(`/api/mailboxes/${mb._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setExpiry", expiresAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate();
      setModal(null);
      toast.success(data.message || "Auto-delete timer set");
    } catch (err) {
      toast.error(err.message || "Failed to set timer");
    } finally {
      setLoading(false);
    }
  };

  const removeExpiry = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mailboxes/${mb._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setExpiry", expiresAt: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate();
      setModal(null);
      toast.success("Auto-delete timer removed");
    } catch (err) {
      toast.error(err.message || "Failed to remove timer");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublic = async () => {
    const next = !mb.isPublic;
    if (next) {
      const ok = await toast.confirm({
        title: "Make mailbox public?",
        message: `Anyone with "${mb.emailAddress}" will be able to read its inbox without logging in.`,
        confirmText: "Make public",
        danger: true,
      });
      if (!ok) return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/mailboxes/${mb._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setPublic", isPublic: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate();
      setOpen(false);
      toast.success(data.message || (next ? "Mailbox is now public" : "Mailbox is now private"));
    } catch (err) {
      toast.error(err.message || "Failed to update visibility");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-xl hover:bg-surface-100 transition-all text-surface-400 hover:text-surface-600"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 card shadow-soft-lg overflow-hidden animate-scale-in">
          <div className="p-1.5">
              <button
                onClick={() => { setOpen(false); onManageTags?.(mb); }}
                className="w-full px-3 py-2.5 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-xl flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-medium">Manage Tags</p>
                  <p className="text-xs text-surface-400">Owner-set mailbox tags</p>
                </div>
                {mb.tags && mb.tags.length > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{mb.tags.length}</span>
                )}
              </button>
              <button
                onClick={openTransfer}
                className="w-full px-3 py-2.5 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-xl flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Transfer Ownership</p>
                  <p className="text-xs text-surface-400">Move to another user</p>
                </div>
              </button>
              <button
                onClick={openExpiry}
                className="w-full px-3 py-2.5 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-xl flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Auto-Delete Timer</p>
                  <p className="text-xs text-surface-400">Schedule deletion</p>
                </div>
              </button>
              <button
                onClick={handleTogglePublic}
                disabled={loading}
                className="w-full px-3 py-2.5 text-left text-sm text-surface-700 hover:bg-surface-50 rounded-xl flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${mb.isPublic ? "bg-surface-100" : "bg-emerald-50"}`}>
                  {mb.isPublic ? (
                    <svg className="w-4 h-4 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{loading ? "Updating…" : mb.isPublic ? "Make Private" : "Make Public"}</p>
                  <p className="text-xs text-surface-400">
                    {mb.isPublic ? "Hide from public viewers" : "Allow anyone to view inbox"}
                  </p>
                </div>
              </button>
              <div className="my-1 mx-3 border-t border-surface-100" />
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">{loading ? "Deleting…" : "Delete Forever"}</p>
                  <p className="text-xs text-red-400">Remove mailbox & all emails</p>
                </div>
              </button>
            </div>
        </div>
      )}

      {/* Transfer Ownership modal */}
      <Modal
        open={modal === "transfer"}
        onClose={() => !loading && setModal(null)}
        title="Transfer Ownership"
        description={`Move "${mb.emailAddress}" to another user. They will become the owner; you will retain shared access only if currently shared.`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        }
        iconClass="bg-blue-50 text-blue-500"
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} disabled={loading} className="btn-ghost text-sm py-2 px-4">
              Cancel
            </button>
            <button type="submit" form="transfer-form" disabled={loading || !transferEmail} className="btn-primary text-sm py-2 px-4">
              {loading ? "Transferring…" : "Transfer"}
            </button>
          </>
        }
      >
        <form id="transfer-form" onSubmit={handleTransfer} className="space-y-3">
          <label className="block text-xs font-semibold text-surface-600 uppercase tracking-wider">
            New owner&apos;s email
          </label>
          <input
            type="email"
            value={transferEmail}
            onChange={(e) => setTransferEmail(e.target.value)}
            placeholder="user@example.com"
            required
            autoFocus
            className="input-field text-sm"
          />
        </form>
      </Modal>

      {/* Auto-Delete Timer modal */}
      <Modal
        open={modal === "expiry"}
        onClose={() => !loading && setModal(null)}
        title="Auto-Delete Timer"
        description="Schedule when this mailbox and all its emails should be deleted."
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        iconClass="bg-orange-50 text-orange-500"
        footer={
          <>
            {mb.expiresAt && (
              <button type="button" onClick={removeExpiry} disabled={loading} className="btn-ghost text-sm py-2 px-4 text-red-500 hover:bg-red-50 mr-auto">
                Remove Timer
              </button>
            )}
            <button type="button" onClick={() => setModal(null)} disabled={loading} className="btn-ghost text-sm py-2 px-4">
              Cancel
            </button>
            <button type="submit" form="expiry-form" disabled={loading || !expiryDate} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Setting…" : "Set Timer"}
            </button>
          </>
        }
      >
        <form id="expiry-form" onSubmit={handleExpiry} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-surface-600 uppercase tracking-wider mb-1.5">Date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                required
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-600 uppercase tracking-wider mb-1.5">Time (optional)</label>
              <input
                type="time"
                value={expiryTime}
                onChange={(e) => setExpiryTime(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-surface-400">Leave time empty to delete at end of day (23:59).</p>
        </form>
      </Modal>
    </div>
  );
}

export default function MailboxList({ mailboxes: initialMailboxes, userId, onUpdate, expandHref = null }) {
  const [shareTarget, setShareTarget] = useState(null);
  const [tagManageMailbox, setTagManageMailbox] = useState(null);
  const [mailboxes, setMailboxes] = useState(initialMailboxes);
  const [copiedId, setCopiedId] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const socketRef = useRef(null);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const updateMailboxLocally = (mailboxId, patch) => {
    setMailboxes((prev) =>
      prev.map((mb) => (mb._id === mailboxId ? { ...mb, ...patch } : mb))
    );
    // Keep modal target in sync so re-opens see fresh data
    setTagManageMailbox((cur) =>
      cur && cur._id === mailboxId ? { ...cur, ...patch } : cur
    );
  };

  const filteredMailboxes = useMemo(() => {
    const match = makeMatcher(search);
    if (!search.trim()) return mailboxes;
    return mailboxes.filter((mb) =>
      match(
        mb.emailAddress,
        mb.lastEmail?.subject,
        mb.lastEmail?.from,
        mb.ownerId?.name,
        mb.ownerId?.email,
        mb.tags,        // owner-set mailbox tags
        mb.emailTags    // aggregated email tags
      )
    );
  }, [mailboxes, search]);
  const totalPages = Math.ceil(filteredMailboxes.length / itemsPerPage);
  
  const paginatedMailboxes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMailboxes.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMailboxes, currentPage]);
  const copyEmail = (email, id) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteMailbox = (deletedId) => {
    setMailboxes((prev) => prev.filter((mb) => mb._id !== deletedId));
  };

  useEffect(() => {
    setMailboxes(initialMailboxes);
    // If the modal target was removed during a re-fetch, close it
    setTagManageMailbox((cur) =>
      cur && initialMailboxes.some((mb) => mb._id === cur._id) ? cur : null
    );
  }, [initialMailboxes]);

  useEffect(() => {
    if (!userId) return;
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => { socket.emit("join-dashboard", userId); });
    socket.on("dashboard-new-email", (data) => {
      setMailboxes((prev) =>
        prev.map((mb) => {
          if (mb._id === data.mailboxId) {
            return { ...mb, lastEmail: data.lastEmail, unreadCount: (mb.unreadCount || 0) + 1 };
          }
          return mb;
        })
      );
    });
    return () => { socket.emit("leave-dashboard", userId); socket.disconnect(); };
  }, [userId]);

  return (
    <>
      <div className="card overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-800">My Mailboxes</h2>
              <p className="text-xs text-surface-400">
                {search.trim() ? `${filteredMailboxes.length} of ${mailboxes.length}` : `${mailboxes.length} mailbox${mailboxes.length !== 1 ? "es" : ""}`}
              </p>
            </div>
          </div>
          {expandHref && (
            <Link
              href={expandHref}
              title="Open full mailboxes view"
              className="p-2 rounded-xl hover:bg-surface-100 transition-all text-surface-400 hover:text-surface-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </Link>
          )}
        </div>

        {/* Search bar — supports regex; falls back to literal substring on invalid pattern */}
        {mailboxes.length > 0 && (
          <div className="px-6 py-3 border-b border-surface-100 bg-white">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search address, sender, tag… (regex supported)"
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-surface-50 border border-surface-100 focus:bg-white focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  title="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>
        )}

        {mailboxes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-sm text-surface-400">No mailboxes yet</p>
            <p className="text-xs text-surface-300 mt-1">Create one to start receiving emails</p>
          </div>
        ) : filteredMailboxes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-surface-400">No matches</p>
            <p className="text-xs text-surface-300 mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <ul className="divide-y divide-surface-50">
              {paginatedMailboxes.map((mb) => {
                const isOwner = mb.ownerId?._id === userId;
                const unread = mb.unreadCount || 0;
                const lastEmail = mb.lastEmail;

              return (
                <li key={mb._id} className="group px-4 sm:px-6 py-4 hover:bg-surface-50/60 transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${unread > 0 ? "bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-brand-sm" : "bg-surface-100 text-surface-500"}`}>
                          {mb.emailAddress?.charAt(0)?.toUpperCase() || "M"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/inbox/${mb._id}`}
                              className="text-sm font-semibold text-surface-800 hover:text-brand-600 truncate transition-colors"
                            >
                              {mb.emailAddress}
                            </Link>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyEmail(mb.emailAddress, mb._id); }}
                              className="shrink-0 p-1 rounded-lg hover:bg-surface-100 transition group/copy"
                              title="Copy email"
                            >
                              {copiedId === mb._id ? (
                                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-surface-300 group-hover/copy:text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                            {unread > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {isOwner ? (
                              <span className="badge-brand text-[10px] py-0.5 px-2">Owner</span>
                            ) : (
                              <span className="badge-warning text-[10px] py-0.5 px-2">Shared by {mb.ownerId?.name}</span>
                            )}
                            {mb.sharedWith?.length > 0 && (
                              <span className="badge-neutral text-[10px] py-0.5 px-2">
                                {mb.sharedWith.length} shared
                              </span>
                            )}
                            {mb.expiresAt && (
                              <span className="badge text-[10px] py-0.5 px-2 bg-orange-50 text-orange-600 border border-orange-100">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {timeUntil(mb.expiresAt)}
                              </span>
                            )}
                            {mb.isPublic && (
                              <span className="badge text-[10px] py-0.5 px-2 bg-emerald-50 text-emerald-600 border border-emerald-100" title="Visitors can view this mailbox without an account">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Public
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Last email preview */}
                      {lastEmail && (
                        <Link
                          href={`/dashboard/inbox/${mb._id}`}
                          className="block mt-3 ml-[46px] p-3 rounded-xl bg-surface-50 border border-surface-100 hover:border-surface-200 hover:bg-white transition-all group/preview"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs truncate flex-1 ${!lastEmail.isRead ? "font-semibold text-surface-800" : "text-surface-500"}`}>
                              {lastEmail.subject || "(No Subject)"}
                            </p>
                            <span className="text-[10px] text-surface-400 whitespace-nowrap shrink-0">
                              {timeAgo(lastEmail.receivedAt)}
                            </span>
                          </div>
                          <p className="text-[11px] text-surface-400 truncate mt-0.5">
                            From: {(() => { const m = lastEmail.from?.match(/^"?([^"<]+?)"?\s*<([^>]+)>/); return m ? m[1].trim() : lastEmail.from; })()}
                          </p>
                        </Link>
                      )}

                      {/* Tag pills: owner-set (filled red) + email-aggregated (outlined red) */}
                      {((mb.tags && mb.tags.length > 0) || (mb.emailTags && mb.emailTags.length > 0)) && (
                        <div className="flex flex-wrap gap-1 mt-2 ml-[46px]">
                          {(mb.tags || []).map((tag) => (
                            <span
                              key={`o-${tag}`}
                              title="Mailbox tag"
                              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-red-700 bg-red-100 border border-red-200 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {(mb.emailTags || [])
                            .filter((t) => !(mb.tags || []).some((o) => o.toLowerCase() === t.toLowerCase()))
                            .map((tag) => (
                              <span
                                key={`e-${tag}`}
                                title="From this mailbox's emails"
                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-red-600 bg-white border border-red-200 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-start sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {isOwner && (
                        <>
                          <button
                            onClick={() => setShareTarget(mb)}
                            className="btn-ghost text-xs py-1.5 px-3 rounded-lg"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            Share
                          </button>
                          <MailboxActions
                            mb={mb}
                            onUpdate={onUpdate}
                            onDelete={handleDeleteMailbox}
                            onManageTags={(target) => setTagManageMailbox(target)}
                          />
                        </>
                      )}
                      <Link
                        href={`/dashboard/inbox/${mb._id}`}
                        className="btn-primary text-xs py-1.5 px-3 rounded-lg"
                      >
                        Open
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          
          {totalPages > 1 && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-surface-50 bg-surface-50/30">
              <p className="text-sm text-surface-500">
                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredMailboxes.length)}</span> of <span className="font-medium">{filteredMailboxes.length}</span> mailboxes
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="px-3 text-sm font-medium text-surface-700">
                  Page {currentPage} of {totalPages}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          </div>
        )}
      </div>

      {shareTarget && (
        <ShareModal
          mailbox={shareTarget}
          onClose={() => setShareTarget(null)}
          onShared={onUpdate}
        />
      )}

      <MailboxTagModal
        mailbox={tagManageMailbox}
        onClose={() => setTagManageMailbox(null)}
        onUpdated={updateMailboxLocally}
      />
    </>
  );
}
