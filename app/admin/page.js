"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now - date) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      console.error("Failed to fetch stats");
    } finally {
      setLoading(false);
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
      fetchStats();
    }
  }, [status, session, router, fetchStats]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const o = stats.overview;
  const sys = stats.system;

  const overviewCards = [
    { label: "Total Users", value: o.totalUsers, icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", color: "brand" },
    { label: "Mailboxes", value: o.totalMailboxes, icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", color: "purple" },
    { label: "Total Emails", value: o.totalEmails, icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4", color: "emerald" },
    { label: "Domains", value: o.totalDomains, icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9", color: "amber" },
    { label: "Unread", value: o.unreadEmails, icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9", color: "red" },
    { label: "Admins", value: o.admins, icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", color: "indigo" },
  ];

  const colorMap = {
    brand: { bg: "bg-brand-50", text: "text-brand-600", ring: "ring-brand-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", ring: "ring-purple-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
    red: { bg: "bg-red-50", text: "text-red-600", ring: "ring-red-100" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-100" },
  };

  const memPercent = sys ? Math.round((sys.usedMemory / sys.totalMemory) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-brand-md">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Admin Panel</h1>
            <p className="text-sm text-surface-500">Platform overview & monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/users" className="btn-primary !rounded-xl !text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Users
          </Link>
          <Link href="/admin/domains" className="btn-ghost !rounded-xl !text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
            Domains
          </Link>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {overviewCards.map((card) => {
          const c = colorMap[card.color];
          return (
            <div key={card.label} className="card p-4 hover:shadow-soft-lg transition-shadow">
              <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center mb-2.5 ring-1 ${c.ring}`}>
                <svg className={`w-4.5 h-4.5 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} /></svg>
              </div>
              <p className="text-2xl font-bold text-surface-900">{card.value.toLocaleString()}</p>
              <p className="text-xs text-surface-500 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email Stats */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-sm font-bold text-surface-800">Email Activity</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-50">
              <span className="text-sm text-surface-600">Today</span>
              <span className="text-sm font-bold text-surface-900">{stats.emailStats.today}</span>
            </div>
            <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-50">
              <span className="text-sm text-surface-600">This Week</span>
              <span className="text-sm font-bold text-surface-900">{stats.emailStats.thisWeek}</span>
            </div>
            <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-50">
              <span className="text-sm text-surface-600">This Month</span>
              <span className="text-sm font-bold text-surface-900">{stats.emailStats.thisMonth}</span>
            </div>
          </div>
        </div>

        {/* System Info */}
        {sys && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
              </div>
              <h3 className="text-sm font-bold text-surface-800">Server Info</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-50">
                <span className="text-sm text-surface-600">Platform</span>
                <span className="text-xs font-mono text-surface-700">{sys.platform} / {sys.arch}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-50">
                <span className="text-sm text-surface-600">CPUs</span>
                <span className="text-sm font-bold text-surface-900">{sys.cpus}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-50">
                <span className="text-sm text-surface-600">Node.js</span>
                <span className="text-xs font-mono text-surface-700">{sys.nodeVersion}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-50">
                <span className="text-sm text-surface-600">Server Uptime</span>
                <span className="text-sm font-bold text-surface-900">{formatUptime(sys.uptime)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Memory */}
        {sys && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
              </div>
              <h3 className="text-sm font-bold text-surface-800">Memory Usage</h3>
            </div>
            <div className="space-y-4">
              {/* System RAM */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-surface-500">System RAM</span>
                  <span className="font-bold text-surface-700">{memPercent}%</span>
                </div>
                <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      memPercent > 80 ? "bg-red-500" : memPercent > 60 ? "bg-amber-500" : "bg-gradient-to-r from-brand-400 to-purple-500"
                    }`}
                    style={{ width: `${memPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-surface-400 mt-1">
                  <span>{formatBytes(sys.usedMemory)} used</span>
                  <span>{formatBytes(sys.totalMemory)} total</span>
                </div>
              </div>

              {/* Process Memory */}
              <div className="pt-3 border-t border-surface-100">
                <p className="text-xs text-surface-500 mb-2">Process Memory (Node.js)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="py-2 px-3 rounded-xl bg-surface-50">
                    <p className="text-xs text-surface-400">RSS</p>
                    <p className="text-sm font-bold text-surface-800">{formatBytes(sys.processMemory?.rss)}</p>
                  </div>
                  <div className="py-2 px-3 rounded-xl bg-surface-50">
                    <p className="text-xs text-surface-400">Heap Used</p>
                    <p className="text-sm font-bold text-surface-800">{formatBytes(sys.processMemory?.heapUsed)}</p>
                  </div>
                </div>
              </div>

              {/* DB Storage */}
              {stats.storage && (
                <div className="pt-3 border-t border-surface-100">
                  <p className="text-xs text-surface-500 mb-2">Email Storage</p>
                  <div className="py-2 px-3 rounded-xl bg-surface-50">
                    <p className="text-xs text-surface-400">Total Size</p>
                    <p className="text-sm font-bold text-surface-800">{formatBytes(stats.storage.storageSize)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Mailboxes */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <h3 className="text-sm font-bold text-surface-800">Top Mailboxes</h3>
          </div>
          {stats.topMailboxes?.length > 0 ? (
            <div className="space-y-2">
              {stats.topMailboxes.map((m, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-surface-50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-amber-100 text-amber-700" : "bg-surface-200 text-surface-600"
                    }`}>{i + 1}</span>
                    <span className="text-sm text-surface-700 truncate">{m.emailAddress || "Unknown"}</span>
                  </div>
                  <span className="text-sm font-bold text-surface-900 shrink-0">{m.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-400 text-center py-4">No data yet</p>
          )}
        </div>

        {/* Recent Users */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <h3 className="text-sm font-bold text-surface-800">Recent Users</h3>
            </div>
            <Link href="/admin/users" className="text-xs text-brand-600 hover:text-brand-700 font-semibold">
              View All →
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recentUsers?.map((u) => (
              <div key={u._id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-surface-50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {u.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">{u.name}</p>
                    <p className="text-xs text-surface-400 truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {u.role === "admin" && <span className="badge-brand text-[10px]">Admin</span>}
                  <span className="text-[11px] text-surface-400">{timeAgo(u.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Emails */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
          </div>
          <h3 className="text-sm font-bold text-surface-800">Recent Emails (Platform-wide)</h3>
        </div>
        {stats.recentEmails?.length > 0 ? (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">Subject</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">From</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-surface-500 uppercase">To</th>
                  <th className="text-right py-2 px-3 text-xs font-bold text-surface-500 uppercase">Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentEmails.map((e) => (
                  <tr key={e._id} className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {!e.isRead && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                        <span className={`truncate max-w-[200px] ${!e.isRead ? "font-semibold text-surface-800" : "text-surface-600"}`}>
                          {e.subject || "(No Subject)"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-surface-500 truncate max-w-[180px]">{e.from}</td>
                    <td className="py-2.5 px-3 text-surface-500 truncate max-w-[180px]">{e.to}</td>
                    <td className="py-2.5 px-3 text-right text-xs text-surface-400 whitespace-nowrap">{timeAgo(e.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-surface-400 text-center py-4">No emails yet</p>
        )}
      </div>
    </div>
  );
}
