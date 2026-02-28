import Link from "next/link";

export const metadata = {
  title: "MailboxSaaS — Self-Hosted Receive-Only Email Platform",
  description:
    "Create custom email mailboxes on your own domains. Self-hosted, team sharing, real-time delivery. No third-party services required.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
        Welcome to <span className="text-indigo-600">MailboxSaaS</span>
      </h1>
      <p className="text-gray-500 text-base sm:text-lg mb-8 max-w-lg">
        Self-hosted, receive-only email platform. Create custom mailboxes on
        your domains, share them with your team, and receive emails in real-time.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
        <Link
          href="/register"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition text-center"
        >
          Get Started
        </Link>
        <Link
          href="/login"
          className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 px-6 py-3 rounded-lg font-medium transition text-center"
        >
          Sign In
        </Link>
      </div>

      {/* Feature highlights for SEO */}
      <section className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full" aria-label="Features">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left">
          <h2 className="font-semibold text-gray-800 mb-1 text-sm">Custom Domains</h2>
          <p className="text-xs text-gray-500">Add your own domains with DNS verification. Full MX + TXT record management.</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left">
          <h2 className="font-semibold text-gray-800 mb-1 text-sm">Real-Time Inbox</h2>
          <p className="text-xs text-gray-500">Emails arrive instantly via WebSocket. No page refresh needed.</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left">
          <h2 className="font-semibold text-gray-800 mb-1 text-sm">Team Sharing</h2>
          <p className="text-xs text-gray-500">Share mailboxes with team members. Granular access control.</p>
        </div>
      </section>
    </div>
  );
}
