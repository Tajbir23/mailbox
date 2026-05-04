"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ChatGPTCheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [inputJson, setInputJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [stats, setStats] = useState({ total: 0, today: 0, uniqueUsers: 0 });

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/chatgpt-checkout/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      if (session.user.role !== "admin" && !session.user.canAccessCheckout) {
        router.push("/dashboard");
      } else {
        fetchStats();
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

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    
    try {
      let parsed;
      try {
        parsed = JSON.parse(inputJson);
      } catch (e) {
        throw new Error("Invalid JSON! Please paste a valid JSON object.");
      }

      const accessToken = parsed.accessToken;
      if (!accessToken) {
        throw new Error("Access token not found in the JSON.");
      }

      const response = await fetch("/api/chatgpt-checkout/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessToken })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to generate checkout session. Status: ${response.status}`);
      }

      if (!data.checkout_session_id) {
        throw new Error("No checkout_session_id found in the response.");
      }

      setCheckoutUrl(`https://chatgpt.com/checkout/openai_llc/${data.checkout_session_id}`);

      // Record the generation in our database
      await fetch("/api/chatgpt-checkout/stats", { method: "POST" });
      fetchStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutUrl);
    alert("URL copied to clipboard!");
  };

  const handleRegenerate = () => {
    setCheckoutUrl("");
    handleGenerate();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-strong rounded-2xl p-6 border border-surface-100 shadow-sm flex flex-col items-center justify-center">
          <p className="text-surface-500 text-sm font-medium uppercase tracking-wider mb-1">Total Generated</p>
          <p className="text-3xl font-bold bg-gradient-to-br from-brand-500 to-purple-600 bg-clip-text text-transparent">
            {stats.total}
          </p>
        </div>
        <div className="glass-strong rounded-2xl p-6 border border-surface-100 shadow-sm flex flex-col items-center justify-center">
          <p className="text-surface-500 text-sm font-medium uppercase tracking-wider mb-1">Generated Today</p>
          <p className="text-3xl font-bold bg-gradient-to-br from-emerald-500 to-teal-600 bg-clip-text text-transparent">
            {stats.today}
          </p>
        </div>
        <div className="glass-strong rounded-2xl p-6 border border-surface-100 shadow-sm flex flex-col items-center justify-center">
          <p className="text-surface-500 text-sm font-medium uppercase tracking-wider mb-1">Unique Users</p>
          <p className="text-3xl font-bold bg-gradient-to-br from-blue-500 to-sky-600 bg-clip-text text-transparent">
            {stats.uniqueUsers}
          </p>
        </div>
      </div>

      <div className="glass-strong rounded-2xl border border-surface-100 p-8 shadow-sm">
        <h1 className="text-3xl font-bold gradient-text mb-4">ChatGPT Checkout</h1>
        <p className="text-surface-600 text-lg mb-8">
          Welcome to the exclusive ChatGPT Checkout area. Only authorized users can see this page.
        </p>
        
        <div className="bg-surface-50 border border-surface-100 rounded-xl p-6">
          {!checkoutUrl ? (
            <>
              <h2 className="text-xl font-semibold text-surface-800 mb-4">Session Info</h2>
              <p className="text-surface-500 mb-4">
                Paste your session JSON block here. The system will extract the access token automatically.
              </p>
              
              <textarea 
                className="input-field w-full h-64 font-mono text-sm mb-4" 
                placeholder='{\n  "WARNING_BANNER": "...",\n  "user": { ... },\n  "accessToken": "ey..."\n}'
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
              />

              {error && (
                <div className="p-4 mb-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
                  {error}
                </div>
              )}
              
              <button 
                onClick={handleGenerate} 
                disabled={loading || !inputJson.trim()} 
                className="btn-primary w-full py-3 text-base disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Checkout Link"}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-surface-800 mb-4">Checkout URL Generated!</h2>
              
              <div className="flex flex-col gap-4 mb-6">
                <input 
                  type="text" 
                  readOnly 
                  value={checkoutUrl} 
                  className="input-field w-full text-surface-800 bg-surface-100" 
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleCopy} 
                  className="btn-primary flex-1 py-3 text-base"
                >
                  Copy URL
                </button>
                <button 
                  onClick={handleRegenerate} 
                  disabled={loading}
                  className="btn-ghost flex-1 py-3 text-base disabled:opacity-50 border border-surface-200"
                >
                  {loading ? "Generating..." : "Regenerate"}
                </button>
                <button 
                  onClick={() => { setCheckoutUrl(""); setInputJson(""); setError(null); }} 
                  className="btn-ghost py-3 px-6 text-base text-red-600 hover:bg-red-50"
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}