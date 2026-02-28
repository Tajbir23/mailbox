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
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MiniBarChart({ data, label, color = "brand" }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);

  const colorClasses = {
    brand: "from-brand-400 to-brand-600",
    emerald: "from-emerald-400 to-emerald-600",
    purple: "from-purple-400 to-purple-600",
  };

  return (
    <div>
      <p className="text-xs font-bold text-surface-600 mb-3">{label}</p>
      <div className="flex items-end gap-1 h-24">
        {data.map((d, i) => {
          const height = Math.max((d.count / max) * 100, 4);
          const dateObj = new Date(d.date || d._id);
          const dayLabel = dayLabels[dateObj.getDay()];
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-surface-500 font-medium">{d.count}</span>
              <div
                className={`w-full rounded-t-md bg-gradient-to-t ${colorClasses[color]} transition-all duration-500 min-w-[8px]`}
                style={{ height: `${height}%` }}
                title={`${d.count} on ${dateObj.toLocaleDateString()}`}
              />
              <span className="text-[9px] text-surface-400">{dayLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminMonitorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setLastUpdated(new Date());
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

  // Auto refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchStats, 15000);
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

  const sys = stats.system;
  const memPercent = sys ? Math.round((sys.usedMemory / sys.totalMemory) * 100) : 0;
  const loadAvg = sys?.loadAvg || [0, 0, 0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="w-9 h-9 rounded-xl bg-surface-100 hover:bg-surface-200 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Server Monitor</h1>
            <p className="text-sm text-surface-500">
              Real-time system & platform metrics
              {lastUpdated && (
                <span className="text-surface-400"> · Updated {lastUpdated.toLocaleTimeString()}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchStats(); }}
          className="btn-ghost !rounded-xl !text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* System Status Cards */}
      {sys && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs font-bold text-surface-500 uppercase">Status</p>
            </div>
            <p className="text-lg font-bold text-emerald-600">Online</p>
            <p className="text-[11px] text-surface-400 mt-0.5">{sys.hostname}</p>
          </div>

          <div className="card p-4">
            <p className="text-xs font-bold text-surface-500 uppercase mb-2">System Uptime</p>
            <p className="text-lg font-bold text-surface-900">{formatUptime(sys.uptime)}</p>
            <p className="text-[11px] text-surface-400 mt-0.5">{sys.platform} / {sys.arch}</p>
          </div>

          <div className="card p-4">
            <p className="text-xs font-bold text-surface-500 uppercase mb-2">Process Uptime</p>
            <p className="text-lg font-bold text-surface-900">{formatUptime(sys.processUptime)}</p>
            <p className="text-[11px] text-surface-400 mt-0.5">Node {sys.nodeVersion}</p>
          </div>

          <div className="card p-4">
            <p className="text-xs font-bold text-surface-500 uppercase mb-2">CPUs</p>
            <p className="text-lg font-bold text-surface-900">{sys.cpus} cores</p>
            <p className="text-[11px] text-surface-400 mt-0.5">
              Load: {loadAvg.map(l => l.toFixed(2)).join(" / ")}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Memory Usage */}
        {sys && (
          <div className="card p-5 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
              </div>
              <h3 className="text-sm font-bold text-surface-800">Memory</h3>
            </div>

            {/* System RAM Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-surface-600 font-medium">System RAM</span>
                <span className="font-bold text-surface-900">{memPercent}%</span>
              </div>
              <div className="h-4 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    memPercent > 85 ? "bg-red-500" : memPercent > 65 ? "bg-amber-500" : "bg-gradient-to-r from-brand-400 to-purple-500"
                  }`}
                  style={{ width: `${memPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-surface-400 mt-1.5">
                <span>{formatBytes(sys.usedMemory)} used</span>
                <span>{formatBytes(sys.freeMemory)} free</span>
                <span>{formatBytes(sys.totalMemory)} total</span>
              </div>
            </div>

            {/* Process Memory */}
            <div className="border-t border-surface-100 pt-4">
              <p className="text-xs font-bold text-surface-600 mb-3">Node.js Process Memory</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="py-2.5 px-3 rounded-xl bg-surface-50 text-center">
                  <p className="text-[10px] text-surface-400 uppercase font-bold">RSS</p>
                  <p className="text-sm font-bold text-surface-800 mt-1">{formatBytes(sys.processMemory?.rss)}</p>
                </div>
                <div className="py-2.5 px-3 rounded-xl bg-surface-50 text-center">
                  <p className="text-[10px] text-surface-400 uppercase font-bold">Heap Used</p>
                  <p className="text-sm font-bold text-surface-800 mt-1">{formatBytes(sys.processMemory?.heapUsed)}</p>
                </div>
                <div className="py-2.5 px-3 rounded-xl bg-surface-50 text-center">
                  <p className="text-[10px] text-surface-400 uppercase font-bold">Heap Total</p>
                  <p className="text-sm font-bold text-surface-800 mt-1">{formatBytes(sys.processMemory?.heapTotal)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Storage */}
        <div className="card p-5 space-y-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
            </div>
            <h3 className="text-sm font-bold text-surface-800">Database & Storage</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="py-3 px-3 rounded-xl bg-surface-50">
              <p className="text-xs text-surface-400 font-bold uppercase">Total Users</p>
              <p className="text-xl font-bold text-surface-900 mt-1">{stats.overview.totalUsers}</p>
            </div>
            <div className="py-3 px-3 rounded-xl bg-surface-50">
              <p className="text-xs text-surface-400 font-bold uppercase">Total Mailboxes</p>
              <p className="text-xl font-bold text-surface-900 mt-1">{stats.overview.totalMailboxes}</p>
            </div>
            <div className="py-3 px-3 rounded-xl bg-surface-50">
              <p className="text-xs text-surface-400 font-bold uppercase">Total Emails</p>
              <p className="text-xl font-bold text-surface-900 mt-1">{stats.overview.totalEmails.toLocaleString()}</p>
            </div>
            <div className="py-3 px-3 rounded-xl bg-surface-50">
              <p className="text-xs text-surface-400 font-bold uppercase">Verified Domains</p>
              <p className="text-xl font-bold text-surface-900 mt-1">{stats.overview.verifiedDomains}</p>
            </div>
          </div>

          {stats.storage && (
            <div className="border-t border-surface-100 pt-4">
              <p className="text-xs font-bold text-surface-600 mb-3">MongoDB Collection Stats</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="py-2.5 px-3 rounded-xl bg-surface-50 text-center">
                  <p className="text-[10px] text-surface-400 uppercase font-bold">Data Size</p>
                  <p className="text-sm font-bold text-surface-800 mt-1">{formatBytes(stats.storage.dataSize)}</p>
                </div>
                <div className="py-2.5 px-3 rounded-xl bg-surface-50 text-center">
                  <p className="text-[10px] text-surface-400 uppercase font-bold">Storage Size</p>
                  <p className="text-sm font-bold text-surface-800 mt-1">{formatBytes(stats.storage.storageSize)}</p>
                </div>
                <div className="py-2.5 px-3 rounded-xl bg-surface-50 text-center">
                  <p className="text-[10px] text-surface-400 uppercase font-bold">Index Size</p>
                  <p className="text-sm font-bold text-surface-800 mt-1">{formatBytes(stats.storage.indexSize)}</p>
                </div>
                <div className="py-2.5 px-3 rounded-xl bg-surface-50 text-center">
                  <p className="text-[10px] text-surface-400 uppercase font-bold">Objects</p>
                  <p className="text-sm font-bold text-surface-800 mt-1">{stats.storage.objects?.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Volume (7 days) */}
        <div className="card p-5">
          <MiniBarChart
            data={stats.emailVolume}
            label="EMAIL VOLUME (LAST 7 DAYS)"
            color="emerald"
          />
        </div>

        {/* User Growth (30 days) — show last 7 bars */}
        <div className="card p-5">
          <MiniBarChart
            data={stats.userGrowth?.slice(-7)}
            label="NEW USERS (LAST 7 DAYS)"
            color="brand"
          />
        </div>
      </div>

      {/* Email Activity Summary */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <h3 className="text-sm font-bold text-surface-800">Email Activity Summary</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="py-3 px-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-100">
            <p className="text-xs font-bold text-emerald-600">Today</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{stats.emailStats.today}</p>
          </div>
          <div className="py-3 px-4 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/50 border border-brand-100">
            <p className="text-xs font-bold text-brand-600">This Week</p>
            <p className="text-2xl font-bold text-brand-800 mt-1">{stats.emailStats.thisWeek}</p>
          </div>
          <div className="py-3 px-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-100">
            <p className="text-xs font-bold text-purple-600">This Month</p>
            <p className="text-2xl font-bold text-purple-800 mt-1">{stats.emailStats.thisMonth}</p>
          </div>
          <div className="py-3 px-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-100">
            <p className="text-xs font-bold text-amber-600">Unread</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{stats.overview.unreadEmails}</p>
          </div>
        </div>
      </div>

      {/* Load Average */}
      {sys && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h3 className="text-sm font-bold text-surface-800">CPU Load Average</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["1 min", "5 min", "15 min"].map((label, idx) => {
              const val = loadAvg[idx] || 0;
              const pct = Math.min((val / sys.cpus) * 100, 100);
              return (
                <div key={label} className="text-center">
                  <p className="text-xs text-surface-500 mb-2">{label}</p>
                  <div className="relative w-20 h-20 mx-auto">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="rgb(var(--surface-100))"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#10b981"}
                        strokeWidth="3"
                        strokeDasharray={`${pct}, 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-surface-800">{val.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
