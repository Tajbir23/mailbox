"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import CreateMailboxForm from "@/components/CreateMailboxForm";
import MailboxList from "@/components/MailboxList";
import UserDomains from "@/components/UserDomains";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mailboxes, setMailboxes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMailboxes = useCallback(async () => {
    try {
      const res = await fetch("/api/mailboxes");
      const data = await res.json();
      setMailboxes(data);
    } catch (err) {
      console.error("Failed to fetch mailboxes:", err);
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
      fetchMailboxes();
    }
  }, [status, router, fetchMailboxes]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-surface-400">Loading your mailboxes…</p>
        </div>
      </div>
    );
  }

  const totalMailboxes = mailboxes.length;
  const totalUnread = mailboxes.reduce((sum, mb) => sum + (mb.unreadCount || 0), 0);
  const sharedCount = mailboxes.filter((mb) => mb.ownerId?._id !== session?.user?.id).length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="section-title">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},{" "}
          <span className="gradient-text">{session?.user?.name?.split(" ")[0]}</span>
        </h1>
        <p className="section-subtitle">
          Manage your mailboxes and domains.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">{totalMailboxes}</p>
            <p className="text-xs text-surface-500">Mailboxes</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">{totalUnread}</p>
            <p className="text-xs text-surface-500">Unread</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4 col-span-2 sm:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">{sharedCount}</p>
            <p className="text-xs text-surface-500">Shared with me</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <CreateMailboxForm onCreated={() => fetchMailboxes()} />
          <UserDomains />
        </div>
        <div className="lg:col-span-2">
          <MailboxList
            mailboxes={mailboxes}
            userId={session?.user?.id}
            onUpdate={fetchMailboxes}
          />
        </div>
      </div>
    </div>
  );
}
