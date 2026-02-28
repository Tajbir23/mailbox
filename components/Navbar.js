"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function Navbar() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 glass-strong border-b border-surface-100/50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center min-w-0">
          {/* Logo & nav links */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-brand-sm group-hover:shadow-brand-md transition-shadow">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-lg font-bold gradient-text hidden sm:inline">MailboxSaaS</span>
            </Link>

            {session && (
              <div className="hidden md:flex items-center ml-6 gap-1">
                <Link
                  href="/dashboard"
                  className="px-3 py-1.5 text-sm font-medium text-surface-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200"
                >
                  Dashboard
                </Link>
                {session.user.role === "admin" && (
                  <>
                    <Link
                      href="/admin"
                      className="px-3 py-1.5 text-sm font-medium text-surface-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200"
                    >
                      Admin
                    </Link>
                    <Link
                      href="/admin/users"
                      className="px-3 py-1.5 text-sm font-medium text-surface-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200"
                    >
                      Users
                    </Link>
                    <Link
                      href="/admin/domains"
                      className="px-3 py-1.5 text-sm font-medium text-surface-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200"
                    >
                      Domains
                    </Link>
                    <Link
                      href="/admin/monitor"
                      className="px-3 py-1.5 text-sm font-medium text-surface-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200"
                    >
                      Monitor
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            {session ? (
              <>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface-50 rounded-lg border border-surface-100">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    {session.user.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <span className="text-sm font-medium text-surface-700 max-w-[120px] truncate">
                    {session.user.name}
                  </span>
                  {session.user.role === "admin" && (
                    <span className="badge-brand text-[10px] py-0.5 px-1.5">Admin</span>
                  )}
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="btn-ghost text-sm py-1.5 px-3"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link href="/login" className="btn-ghost text-sm py-2 px-4">
                  Log In
                </Link>
                <Link href="/register" className="btn-primary text-sm py-2 px-4">
                  Get Started
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-surface-100 transition text-surface-600"
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-surface-100 bg-white/95 backdrop-blur-lg animate-slide-down">
          <div className="px-4 py-3 space-y-1">
            {session ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                    {session.user.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">{session.user.name}</p>
                    <p className="text-xs text-surface-500">{session.user.email}</p>
                  </div>
                </div>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 text-sm font-medium text-surface-700 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition"
                >
                  Dashboard
                </Link>
                {session.user.role === "admin" && (
                  <>
                    <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Admin</p>
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2 text-sm font-medium text-surface-700 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/admin/users"
                      onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2 text-sm font-medium text-surface-700 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition"
                    >
                      Users
                    </Link>
                    <Link
                      href="/admin/domains"
                      onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2 text-sm font-medium text-surface-700 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition"
                    >
                      Domains
                    </Link>
                    <Link
                      href="/admin/monitor"
                      onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2 text-sm font-medium text-surface-700 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition"
                    >
                      Monitor
                    </Link>
                  </>
                )}
                <button
                  onClick={() => { signOut({ callbackUrl: "/login" }); setMobileOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 text-sm font-medium text-surface-700 hover:bg-brand-50 rounded-lg transition"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
