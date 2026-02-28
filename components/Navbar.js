"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-16 items-center min-w-0">
          <div className="flex items-center space-x-3 sm:space-x-6 min-w-0 overflow-hidden">
            <Link href="/" className="text-lg sm:text-xl font-bold text-indigo-600 shrink-0">
              MailboxSaaS
            </Link>
            {session && (
              <>
                <Link
                  href="/dashboard"
                  className="text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium shrink-0"
                >
                  Dashboard
                </Link>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin/domains"
                    className="text-gray-600 hover:text-gray-900 text-xs sm:text-sm font-medium shrink-0"
                  >
                    Manage Domains
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 shrink-0">
            {session ? (
              <>
                <span className="text-xs sm:text-sm text-gray-500 truncate max-w-[120px] sm:max-w-[200px] hidden xs:inline">
                  {session.user.name}{" "}
                  <span className="text-xs text-indigo-500 font-medium">
                    ({session.user.role})
                  </span>
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 sm:px-3 py-1.5 rounded-md transition whitespace-nowrap"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs sm:text-sm text-gray-600 hover:text-gray-900"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-2 sm:px-3 py-1.5 rounded-md transition whitespace-nowrap"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
