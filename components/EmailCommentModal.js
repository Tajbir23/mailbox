"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

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

export default function EmailCommentModal({
  email,
  mailboxId,
  currentUserId,
  isOwner,
  onClose,
  onUpdated,
}) {
  const [comments, setComments] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!email) return;
    setComments(email.comments || []);
    setInput("");
    setEditingId(null);
    setEditText("");
  }, [email?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!email) return null;

  const sync = (next) => {
    setComments(next);
    onUpdated?.(email._id, { comments: next });
  };

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/mailboxes/${mailboxId}/emails/${email._id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      sync([...comments, data.comment]);
      setInput("");
    } catch (err) {
      toast.error(err.message || "Failed to add comment");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c) => {
    setEditingId(String(c._id));
    setEditText(c.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (e) => {
    e?.preventDefault?.();
    const text = editText.trim();
    if (!text) {
      toast.error("Comment cannot be empty");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/mailboxes/${mailboxId}/emails/${email._id}/comments`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId: editingId, text }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      sync(
        comments.map((c) =>
          String(c._id) === String(editingId) ? data.comment : c
        )
      );
      cancelEdit();
    } catch (err) {
      toast.error(err.message || "Failed to save comment");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (commentId) => {
    const ok = await toast.confirm({
      title: "Delete comment?",
      message: "This comment will be removed for everyone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(
        `/api/mailboxes/${mailboxId}/emails/${email._id}/comments?commentId=${commentId}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      sync(comments.filter((c) => String(c._id) !== String(commentId)));
      if (editingId === String(commentId)) cancelEdit();
    } catch (err) {
      toast.error(err.message || "Failed to delete comment");
    }
  };

  return (
    <Modal
      open={!!email}
      onClose={() => !busy && onClose?.()}
      title="Comments"
      description={email.subject || "(No subject)"}
      icon={
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      }
      iconClass="bg-brand-50 text-brand-600"
      size="lg"
      footer={
        <button type="button" onClick={() => onClose?.()} disabled={busy} className="btn-ghost text-sm py-2 px-4">
          Done
        </button>
      }
    >
      <div className="space-y-4">
        {/* Existing comments */}
        <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {comments.length === 0 ? (
            <li className="text-xs text-surface-400 italic px-1">
              No comments yet — be the first to add one.
            </li>
          ) : (
            comments.map((c) => {
              const cid = String(c._id);
              const isAuthor = currentUserId && String(c.userId) === String(currentUserId);
              const canDelete = isAuthor || isOwner;
              const canEdit = isAuthor;
              const isEditing = editingId === cid;
              return (
                <li key={cid} className="bg-surface-50/60 border border-surface-100 rounded-xl px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-xs font-semibold text-surface-800 truncate">
                        {c.userName || "User"}
                      </span>
                      <span className="text-[10px] text-surface-400">
                        {timeAgo(c.createdAt)}
                        {c.updatedAt && new Date(c.updatedAt).getTime() !== new Date(c.createdAt).getTime() && (
                          <span className="ml-1 italic">(edited)</span>
                        )}
                      </span>
                    </div>
                    {!isEditing && (canEdit || canDelete) && (
                      <div className="flex items-center gap-1 shrink-0">
                        {canEdit && (
                          <button
                            onClick={() => startEdit(c)}
                            disabled={busy}
                            title="Edit comment"
                            className="p-1 rounded hover:bg-brand-50 text-surface-400 hover:text-brand-600 transition disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(cid)}
                            disabled={busy}
                            title="Delete comment"
                            className="p-1 rounded hover:bg-red-50 text-surface-400 hover:text-red-500 transition disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <form onSubmit={saveEdit} className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        autoFocus
                        disabled={busy}
                        className="w-full px-3 py-2 text-sm bg-white border border-surface-200 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 rounded-lg resize-none transition disabled:opacity-50"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={busy}
                          className="text-xs px-3 py-1.5 rounded-md hover:bg-surface-100 text-surface-600 font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={busy || !editText.trim()}
                          className="btn-primary text-xs py-1.5 px-3 rounded-md disabled:opacity-50"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-sm text-surface-700 whitespace-pre-wrap break-words">
                      {c.text}
                    </p>
                  )}
                </li>
              );
            })
          )}
        </ul>

        {/* Add new comment */}
        <form onSubmit={handleAdd} className="flex items-end gap-2 pt-3 border-t border-surface-100">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Write a comment…"
            rows={2}
            maxLength={2000}
            disabled={busy}
            className="flex-1 px-3 py-2 text-sm bg-white border border-surface-200 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 rounded-xl resize-none transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 btn-primary text-xs py-2 px-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </form>
      </div>
    </Modal>
  );
}
