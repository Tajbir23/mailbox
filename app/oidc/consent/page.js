"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const SCOPE_DESCRIPTIONS = {
  openid: "Verify your identity",
  profile: "Access your name",
  email: "Access your email address",
  offline_access: "Maintain access when you're not present",
};

function ConsentContent() {
  const searchParams = useSearchParams();

  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Extract OIDC parameters from URL
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const scope = searchParams.get("scope") || "";
  const state = searchParams.get("state");
  const nonce = searchParams.get("nonce");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");

  const scopes = scope.split(" ").filter(Boolean);

  // Fetch client display name on mount
  useEffect(() => {
    if (!clientId) {
      setError("Missing client_id parameter");
      setLoading(false);
      return;
    }

    async function fetchClientInfo() {
      try {
        const res = await fetch(`/api/oidc/client-info?client_id=${encodeURIComponent(clientId)}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load application information");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setClientName(data.display_name);
      } catch (err) {
        setError("Failed to load application information");
      } finally {
        setLoading(false);
      }
    }

    fetchClientInfo();
  }, [clientId]);

  const handleApprove = async () => {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/oidc/authorize/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
        }),
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const data = await res.json();

      // The consent API returns { redirect: "<redirect_uri>?code=...&state=..." }
      const redirectTo = data.redirect || data.redirect_url;
      if (redirectTo) {
        window.location.href = redirectTo;
      } else {
        setError(data.error_description || data.error || "Authorization failed. Please try again.");
        setSubmitting(false);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  const handleDeny = () => {
    if (!redirectUri) {
      setError("Missing redirect_uri — cannot deny");
      return;
    }

    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) {
      url.searchParams.set("state", state);
    }
    window.location.href = url.toString();
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 animate-pulse" />
      </div>
    );
  }

  // Error state (missing params or client not found)
  if (error && !clientName) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="card p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-surface-900 mb-2">Authorization Error</h2>
            <p className="text-sm text-surface-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 animate-fade-in">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-200/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-brand-md mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-surface-900">Authorize Application</h1>
          <p className="text-surface-500 text-sm mt-1">
            <span className="font-semibold text-surface-700">{clientName}</span> wants to access your account
          </p>
        </div>

        {/* Card */}
        <div className="card p-8">
          {/* Permissions list */}
          <div className="mb-6">
            <h2 className="text-sm font-medium text-surface-700 mb-3">
              This application will be able to:
            </h2>
            <ul className="space-y-3">
              {scopes.map((s) => {
                const description = SCOPE_DESCRIPTIONS[s];
                if (!description) return null;
                return (
                  <li key={s} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm text-surface-700">{description}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDeny}
              disabled={submitting}
              className="flex-1 py-3 px-4 text-sm font-medium text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-xl border border-surface-200 transition disabled:opacity-50"
            >
              Deny
            </button>
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="btn-primary flex-1 py-3 text-sm"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Approving…
                </span>
              ) : (
                "Approve"
              )}
            </button>
          </div>

          {/* Info note */}
          <p className="mt-4 text-xs text-surface-400 text-center">
            You can revoke this access anytime from your account settings.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 animate-pulse" />
        </div>
      }
    >
      <ConsentContent />
    </Suspense>
  );
}
