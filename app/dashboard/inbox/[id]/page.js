"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import InboxView from "@/components/InboxView";

export default function InboxPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const mailboxId = params.id;
  const [mailbox, setMailbox] = useState(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    // Fetch mailbox info from the list endpoint to get name
    fetch("/api/mailboxes")
      .then((res) => res.json())
      .then((data) => {
        const found = data.find((mb) => mb._id === mailboxId);
        setMailbox(found || null);
      })
      .catch(() => {});
  }, [mailboxId]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <Link
          href="/dashboard"
          className="text-gray-400 hover:text-gray-600 transition"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-bold text-gray-900">
          {mailbox?.emailAddress || "Inbox"}
        </h1>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
          Live
        </span>
      </div>

      <InboxView mailboxId={mailboxId} />
    </div>
  );
}
