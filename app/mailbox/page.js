import { Suspense } from "react";
import PublicMailboxView from "@/components/PublicMailboxView";

export const metadata = {
  title: "Public Mailbox — MailboxSaaS",
  description:
    "Watch a public mailbox in real-time. Drop in any public email address — no signup required.",
  alternates: { canonical: "/mailbox" },
  robots: { index: false, follow: false },
};

export default function MailboxRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 flex items-center justify-center">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      }
    >
      <PublicMailboxView />
    </Suspense>
  );
}
