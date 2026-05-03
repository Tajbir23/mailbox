"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MailboxList from "@/components/MailboxList";

export default function MailboxesPage() {
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
    if (status === "authenticated") fetchMailboxes();
  }, [status, router, fetchMailboxes]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-xl bg-surface-100 hover:bg-surface-200 flex items-center justify-center text-surface-500 hover:text-surface-700 transition-all"
          title="Back to dashboard"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-surface-900">All Mailboxes</h1>
          <p className="text-xs text-surface-400">
            {mailboxes.length} mailbox{mailboxes.length !== 1 ? "es" : ""}
          </p>
        </div>
      </div>

      <MailboxList
        mailboxes={mailboxes}
        userId={session?.user?.id}
        onUpdate={fetchMailboxes}
      />
    </div>
  );
}
