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
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Create mailboxes on public domains or your own private domains.
        </p>
      </div>

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
