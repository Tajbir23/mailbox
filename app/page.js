import Link from "next/link";

export const metadata = {
  title: "MailboxSaaS — Self-Hosted Receive-Only Email Platform",
  description:
    "Create custom email mailboxes on your own domains. Self-hosted, team sharing, real-time delivery. No third-party services required.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="animate-fade-in">
      {/* ── Hero Section ── */}
      <section className="relative min-h-[80vh] flex flex-col items-center justify-center text-center px-4 -mt-6 sm:-mt-8 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-brand-400/10 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-brand-100/20 to-transparent rounded-full" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-sm font-medium mb-8 animate-slide-up">
            <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
            Self-Hosted Email Platform
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-surface-900 mb-6 animate-slide-up text-balance" style={{ animationDelay: "0.1s" }}>
            Your Inbox,{" "}
            <span className="gradient-text">Your Rules</span>
          </h1>

          <p className="text-lg sm:text-xl text-surface-500 mb-10 max-w-2xl mx-auto animate-slide-up leading-relaxed" style={{ animationDelay: "0.2s" }}>
            Create custom mailboxes on your own domains. Receive emails in real-time,
            share with your team, and own your data completely.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <Link href="/register" className="btn-primary text-base px-8 py-3.5 rounded-2xl shadow-brand-lg hover:shadow-brand-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start for Free
            </Link>
            <Link href="/login" className="btn-secondary text-base px-8 py-3.5 rounded-2xl">
              Sign In
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Floating email preview mockup */}
        <div className="relative z-10 mt-16 w-full max-w-3xl mx-auto animate-slide-up" style={{ animationDelay: "0.5s" }}>
          <div className="card p-1 shadow-soft-lg animate-glow">
            <div className="bg-surface-50 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-surface-100">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-2 text-xs text-surface-400 font-mono">inbox@yourdomain.com</span>
              </div>
              <div className="space-y-3">
                {[
                  { from: "GitHub", subject: "Your pull request has been merged!", time: "2m ago", unread: true },
                  { from: "Stripe", subject: "Payment received — $49.00", time: "15m ago", unread: true },
                  { from: "AWS", subject: "Monthly billing statement", time: "1h ago", unread: false },
                ].map((email, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg transition ${email.unread ? "bg-white shadow-sm" : "bg-transparent"}`}>
                    {email.unread && <span className="w-2 h-2 bg-brand-500 rounded-full shrink-0" />}
                    {!email.unread && <span className="w-2 h-2 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${email.unread ? "font-semibold text-surface-900" : "text-surface-600"}`}>{email.from}</span>
                        <span className="text-xs text-surface-400 shrink-0">{email.time}</span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${email.unread ? "text-surface-600" : "text-surface-400"}`}>{email.subject}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section className="py-20 sm:py-28" aria-label="Features">
        <div className="text-center mb-14">
          <h2 className="section-title">Everything you need</h2>
          <p className="section-subtitle max-w-xl mx-auto mt-3">
            A complete email receiving platform that runs on your infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              ),
              title: "Custom Domains",
              desc: "Add your own domains with DNS verification. Full MX + TXT record management with guided setup.",
              color: "from-blue-500 to-cyan-500",
              bg: "bg-blue-50",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ),
              title: "Real-Time Delivery",
              desc: "Emails arrive instantly via WebSocket push. Zero delay, no page refreshing. Live inbox experience.",
              color: "from-brand-500 to-purple-500",
              bg: "bg-brand-50",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              ),
              title: "Team Sharing",
              desc: "Share mailboxes with team members. Transfer ownership, set auto-expiry timers.",
              color: "from-emerald-500 to-teal-500",
              bg: "bg-emerald-50",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ),
              title: "Fully Self-Hosted",
              desc: "Your server, your data. No third-party services, complete privacy and control.",
              color: "from-orange-500 to-amber-500",
              bg: "bg-orange-50",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ),
              title: "Security First",
              desc: "XSS protection, rate limiting, CSP headers, sanitized email rendering. Built secure by default.",
              color: "from-red-500 to-pink-500",
              bg: "bg-red-50",
            },
            {
              icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "Auto-Expiry",
              desc: "Set mailbox deletion timers. Mailboxes and emails auto-clean after your specified time.",
              color: "from-violet-500 to-purple-500",
              bg: "bg-violet-50",
            },
          ].map((f, i) => (
            <div key={i} className="card-hover p-6 group">
              <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <div className={`bg-gradient-to-br ${f.color} bg-clip-text`}>
                  <span className="text-transparent">{f.icon}</span>
                </div>
                <div className={`absolute text-transparent bg-gradient-to-br ${f.color}`} style={{ WebkitBackgroundClip: "text" }}>
                </div>
              </div>
              <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center mb-4 -mt-16 group-hover:scale-110 transition-transform duration-300 text-surface-700`}>
                {f.icon}
              </div>
              <h3 className="text-base font-semibold text-surface-800 mb-2">{f.title}</h3>
              <p className="text-sm text-surface-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-900 via-brand-950 to-surface-900 px-8 py-14 sm:px-14 sm:py-20 text-center">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-brand-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">
              Ready to own your inbox?
            </h2>
            <p className="text-surface-300 text-lg mb-8 max-w-lg mx-auto">
              Start receiving emails on your custom domains in under 5 minutes.
            </p>
            <Link href="/register" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-surface-900 font-semibold rounded-2xl hover:bg-surface-100 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]">
              Get Started — It&apos;s Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
