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
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [showResetModal, setShowResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (search) params.append("search", search);
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch {
      console.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

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
      fetchUsers();
    }
  }, [status, session, router, fetchUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const showMessage = (msg, type = "success") => {
    setActionMessage({ text: msg, type });
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleToggleRole = async (userId, currentRole) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, action: "toggleRole" }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage(`Role changed to ${currentRole === "admin" ? "user" : "admin"}`);
        fetchUsers();
      } else {
        showMessage(data.error || "Failed", "error");
      }
    } catch {
      showMessage("Error toggling role", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showMessage("Password must be at least 6 characters", "error");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: showResetModal._id, action: "resetPassword", newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("Password reset successfully");
        setShowResetModal(null);
        setNewPassword("");
      } else {
        showMessage(data.error || "Failed", "error");
      }
    } catch {
      showMessage("Error resetting password", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users?id=${showDeleteModal._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("User deleted with all associated data");
        setShowDeleteModal(null);
        fetchUsers();
      } else {
        showMessage(data.error || "Failed", "error");
      }
    } catch {
      showMessage("Error deleting user", "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Success/Error Toast */}
      {actionMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          actionMessage.type === "error"
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
        }`}>
          {actionMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="w-9 h-9 rounded-xl bg-surface-100 hover:bg-surface-200 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">User Management</h1>
            <p className="text-sm text-surface-500">{total} total user{total !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email..."
            className="input-field !pl-10"
          />
        </div>
        <button type="submit" className="btn-primary !rounded-xl !px-5">
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
            className="btn-ghost !rounded-xl !px-3"
          >
            Clear
          </button>
        )}
      </form>

      {/* Users Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-purple-500 animate-pulse" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-12 h-12 text-surface-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <p className="text-surface-500">No users found</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50/50">
                    <th className="text-left py-3 px-4 text-xs font-bold text-surface-500 uppercase">User</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-surface-500 uppercase">Role</th>
                    <th className="text-center py-3 px-4 text-xs font-bold text-surface-500 uppercase">Mailboxes</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-surface-500 uppercase">Joined</th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-surface-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u._id === session?.user?.id;
                    return (
                      <tr key={u._id} className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                              {u.name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-surface-800 truncate">{u.name}{isSelf && <span className="text-xs text-surface-400 ml-1">(you)</span>}</p>
                              <p className="text-xs text-surface-400 truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            u.role === "admin"
                              ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100"
                              : "bg-surface-100 text-surface-600"
                          }`}>
                            {u.role === "admin" && (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            )}
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-sm font-bold text-surface-700">{u.mailboxCount || 0}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-surface-500">{timeAgo(u.createdAt)}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isSelf && (
                              <>
                                <button
                                  onClick={() => handleToggleRole(u._id, u.role)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-100 hover:bg-surface-200 text-surface-700 transition-colors disabled:opacity-50"
                                  title={`Make ${u.role === "admin" ? "user" : "admin"}`}
                                >
                                  {u.role === "admin" ? "Demote" : "Promote"}
                                </button>
                                <button
                                  onClick={() => setShowResetModal(u)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors disabled:opacity-50"
                                >
                                  Reset PW
                                </button>
                                <button
                                  onClick={() => setShowDeleteModal(u)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 transition-colors disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2 p-3">
              {users.map((u) => {
                const isSelf = u._id === session?.user?.id;
                return (
                  <div key={u._id} className="rounded-xl bg-surface-50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {u.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-surface-800 truncate">{u.name}{isSelf && <span className="text-xs text-surface-400 ml-1">(you)</span>}</p>
                          <p className="text-xs text-surface-400 truncate">{u.email}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        u.role === "admin" ? "bg-brand-50 text-brand-700" : "bg-surface-200 text-surface-600"
                      }`}>{u.role}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-surface-500">
                      <span>{u.mailboxCount || 0} mailboxes</span>
                      <span>Joined {timeAgo(u.createdAt)}</span>
                    </div>
                    {!isSelf && (
                      <div className="flex gap-1.5 pt-1">
                        <button onClick={() => handleToggleRole(u._id, u.role)} disabled={actionLoading} className="flex-1 py-2 rounded-lg text-xs font-medium bg-surface-200 hover:bg-surface-300 text-surface-700 transition-colors">
                          {u.role === "admin" ? "Demote" : "Promote"}
                        </button>
                        <button onClick={() => setShowResetModal(u)} disabled={actionLoading} className="flex-1 py-2 rounded-lg text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors">
                          Reset PW
                        </button>
                        <button onClick={() => setShowDeleteModal(u)} disabled={actionLoading} className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 transition-colors">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-100 hover:bg-surface-200 text-surface-600 disabled:opacity-30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm text-surface-600 px-3">
            Page <span className="font-bold text-surface-800">{page}</span> of <span className="font-bold text-surface-800">{totalPages}</span>
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-100 hover:bg-surface-200 text-surface-600 disabled:opacity-30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowDeleteModal(null)}>
          <div className="card p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-surface-900">Delete User</h3>
                <p className="text-sm text-surface-500">This action cannot be undone</p>
              </div>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-sm text-red-800">
                Deleting <strong>{showDeleteModal.name}</strong> ({showDeleteModal.email}) will permanently remove:
              </p>
              <ul className="text-sm text-red-700 mt-2 space-y-1 list-disc list-inside">
                <li>All their mailboxes</li>
                <li>All emails in those mailboxes</li>
                <li>All their custom domains</li>
                <li>Shared mailbox access</li>
              </ul>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="btn-ghost flex-1 !rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={actionLoading}
                className="btn-danger flex-1 !rounded-xl"
              >
                {actionLoading ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => { setShowResetModal(null); setNewPassword(""); }}>
          <div className="card p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-surface-900">Reset Password</h3>
                <p className="text-sm text-surface-500">For {showResetModal.name}</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-surface-700 mb-1.5 block">New Password</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters..."
                className="input-field"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowResetModal(null); setNewPassword(""); }}
                className="btn-ghost flex-1 !rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={actionLoading || newPassword.length < 6}
                className="btn-primary flex-1 !rounded-xl"
              >
                {actionLoading ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
