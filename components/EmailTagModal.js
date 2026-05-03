"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

// Manage tags for one email — add (one or comma-separated multiple), edit, remove.
export default function EmailTagModal({ email, mailboxId, onClose, onUpdated }) {
  const [tags, setTags] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // tag string being edited
  const [editText, setEditText] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!email) return;
    setTags(email.tags || []);
    setInput("");
    setEditing(null);
    setEditText("");
  }, [email?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!email) return null;

  const persist = async (next) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/mailboxes/${mailboxId}/emails/${email._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setTags", tags: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTags(data.tags);
      onUpdated?.(email._id, { tags: data.tags });
      return true;
    } catch (err) {
      toast.error(err.message || "Failed to update tags");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    const raw = input.trim();
    if (!raw) return;
    // Split on commas to allow bulk-add
    const incoming = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (incoming.length === 0) return;
    const lower = new Set(tags.map((t) => t.toLowerCase()));
    const additions = [];
    for (const t of incoming) {
      const k = t.toLowerCase();
      if (!lower.has(k)) {
        lower.add(k);
        additions.push(t);
      }
    }
    if (additions.length === 0) {
      setInput("");
      return;
    }
    const next = [...tags, ...additions];
    const ok = await persist(next);
    if (ok) setInput("");
  };

  const handleRemove = async (tag) => {
    const next = tags.filter((t) => t !== tag);
    await persist(next);
  };

  const startEdit = (tag) => {
    setEditing(tag);
    setEditText(tag);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditText("");
  };

  const saveEdit = async (e) => {
    e?.preventDefault?.();
    const trimmed = editText.trim();
    if (!trimmed) {
      toast.error("Tag cannot be empty");
      return;
    }
    if (trimmed === editing) {
      cancelEdit();
      return;
    }
    // dedupe vs other tags (case-insensitive)
    const others = tags.filter((t) => t !== editing);
    if (others.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Tag already exists");
      return;
    }
    const next = tags.map((t) => (t === editing ? trimmed : t));
    const ok = await persist(next);
    if (ok) cancelEdit();
  };

  return (
    <Modal
      open={!!email}
      onClose={() => !busy && onClose?.()}
      title="Manage Tags"
      description={email.subject || "(No subject)"}
      icon={
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      }
      iconClass="bg-red-50 text-red-600"
      footer={
        <button type="button" onClick={() => onClose?.()} disabled={busy} className="btn-ghost text-sm py-2 px-4">
          Done
        </button>
      }
    >
      <div className="space-y-4">
        {/* Existing tags */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-surface-500 font-semibold mb-2">
            Current tags ({tags.length})
          </p>
          {tags.length === 0 ? (
            <p className="text-xs text-surface-400 italic">No tags yet — add one below.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) =>
                editing === tag ? (
                  <li key={tag} className="w-full">
                    <form onSubmit={saveEdit} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                        maxLength={40}
                        disabled={busy}
                        className="flex-1 px-2 py-1 text-sm bg-white border border-red-300 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 rounded-md transition disabled:opacity-50"
                      />
                      <button type="submit" disabled={busy} className="text-xs px-3 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50">
                        Save
                      </button>
                      <button type="button" onClick={cancelEdit} disabled={busy} className="text-xs px-3 py-1 rounded-md hover:bg-surface-100 text-surface-500 font-medium disabled:opacity-50">
                        Cancel
                      </button>
                    </form>
                  </li>
                ) : (
                  <li key={tag}>
                    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-semibold text-red-700 bg-red-100 border border-red-200 rounded-md">
                      <button
                        onClick={() => startEdit(tag)}
                        disabled={busy}
                        title="Edit tag"
                        className="hover:underline disabled:opacity-50"
                      >
                        {tag}
                      </button>
                      <button
                        onClick={() => handleRemove(tag)}
                        disabled={busy}
                        title="Remove tag"
                        className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-200 text-red-500 hover:text-red-700 disabled:opacity-50 transition"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  </li>
                )
              )}
            </ul>
          )}
        </div>

        {/* Add input */}
        <form onSubmit={handleAdd} className="flex items-stretch gap-2 pt-3 border-t border-surface-100">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add tag — separate multiple with commas"
            disabled={busy}
            maxLength={400}
            className="input-field text-sm flex-1"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="btn-primary text-sm px-4 py-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "…" : "Add"}
          </button>
        </form>
      </div>
    </Modal>
  );
}
