"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ChatGPTCheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      if (session.user.role !== "admin" && !session.user.canAccessCheckout) {
        router.push("/dashboard");
      }
    }
  }, [status, session, router]);

  if (status === "loading" || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>
    );
  }

  // Prevent flash content
  if (session.user.role !== "admin" && !session.user.canAccessCheckout) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="glass-strong rounded-2xl border border-surface-100 p-8 shadow-sm">
        <h1 className="text-3xl font-bold gradient-text mb-4">ChatGPT Checkout</h1>
        <p className="text-surface-600 text-lg mb-8">
          Welcome to the exclusive ChatGPT Checkout area. Only authorized users can see this page.
        </p>
        
        <div className="bg-surface-50 border border-surface-100 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-surface-800 mb-4">Checkout Processing</h2>
          <p className="text-surface-500 mb-6">
            Place your checkout component or forms here.
          </p>
          
          <button className="btn-primary w-full py-3 text-base">
            Proceed with Checkout
          </button>
        </div>
      </div>
    </div>
  );
}