"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SettingsPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState({ name: "", email: "" });
  const [profilePassword, setProfilePassword] = useState("");
  const [profileMsg, setProfileMsg] = useState({ type: "", text: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwMsg, setPwMsg] = useState({ type: "", text: "" });
  const [pwLoading, setPwLoading] = useState(false);

  // Authorized apps state
  const [authorizedApps, setAuthorizedApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const fetchAuthorizedApps = () => {
    fetch("/api/user/authorized-apps")
      .then((r) => r.json())
      .then((data) => {
        setAuthorizedApps(data.apps || []);
      })
      .catch(() => {})
      .finally(() => setAppsLoading(false));
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/user/profile")
        .then((r) => r.json())
        .then((data) => {
          if (data?.email) {
            setProfile({ name: data.name || "", email: data.email });
            setOriginalEmail(data.email);
          }
        })
        .catch(() => {});
      fetchAuthorizedApps();
    }
  }, [status, router]);

  const submitProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: "", text: "" });
    setProfileLoading(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          currentPassword: profilePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ type: "error", text: data.error || "Update failed" });
        return;
      }

      const emailChanged = profile.email !== originalEmail;
      setProfilePassword("");

      if (emailChanged) {
        setProfileMsg({
          type: "success",
          text: "Email updated. Please sign in again with your new email.",
        });
        setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
      } else {
        // Refresh the JWT so the Navbar reflects the new name immediately
        await updateSession({ name: data.user?.name });
        setProfileMsg({ type: "success", text: data.message || "Profile updated" });
      }
    } catch {
      setProfileMsg({ type: "error", text: "Network error" });
    } finally {
      setProfileLoading(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwMsg({ type: "", text: "" });

    if (pw.newPassword !== pw.confirmPassword) {
      setPwMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    if (pw.newPassword.length < 6) {
      setPwMsg({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setPwLoading(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pw.currentPassword,
          newPassword: pw.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ type: "error", text: data.error || "Update failed" });
        return;
      }
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwMsg({
        type: "success",
        text: "Password updated. Please sign in again.",
      });
      setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
    } catch {
      setPwMsg({ type: "error", text: "Network error" });
    } finally {
      setPwLoading(false);
    }
  };

  const revokeApp = async (client_id) => {
    setRevokeLoading(true);
    try {
      const res = await fetch(`/api/user/authorized-apps?client_id=${encodeURIComponent(client_id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAuthorizedApps((apps) => apps.filter((a) => a.client_id !== client_id));
      }
    } catch {
      // silently fail
    } finally {
      setRevokeLoading(false);
      setRevokeConfirm(null);
    }
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-surface-500 hover:text-brand-600 inline-flex items-center gap-1 mb-3"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to dashboard
        </Link>
        <h1 className="section-title">Account settings</h1>
        <p className="section-subtitle">Update your profile information and password.</p>
      </div>

      <div className="card p-6 sm:p-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-surface-900 mb-1">API access</h2>
          <p className="text-sm text-surface-500">
            Manage API keys to use the Mailbox REST API from scripts and integrations.
          </p>
        </div>
        <Link href="/dashboard/api-keys" className="btn-secondary py-2 px-4 text-sm shrink-0">
          API keys →
        </Link>
      </div>

      {/* Profile / Email */}
      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-surface-900 mb-1">Profile</h2>
        <p className="text-sm text-surface-500 mb-6">
          Change your display name or sign-in email. Email changes require you to sign in again.
        </p>

        <form onSubmit={submitProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Full name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Current password{" "}
              <span className="text-surface-400 font-normal">(to confirm changes)</span>
            </label>
            <input
              type="password"
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>

          {profileMsg.text && (
            <div
              className={`px-4 py-3 rounded-xl text-sm border ${
                profileMsg.type === "error"
                  ? "bg-red-50 border-red-100 text-red-700"
                  : "bg-emerald-50 border-emerald-100 text-emerald-700"
              }`}
            >
              {profileMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={profileLoading}
            className="btn-primary py-2.5 px-5 text-sm"
          >
            {profileLoading ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-surface-900 mb-1">Password</h2>
        <p className="text-sm text-surface-500 mb-6">
          Choose a strong password. You will be signed out from this device after changing it.
        </p>

        <form onSubmit={submitPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Current password
            </label>
            <input
              type="password"
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              New password
            </label>
            <input
              type="password"
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
              className="input-field"
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              value={pw.confirmPassword}
              onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })}
              className="input-field"
              minLength={6}
              required
            />
          </div>

          {pwMsg.text && (
            <div
              className={`px-4 py-3 rounded-xl text-sm border ${
                pwMsg.type === "error"
                  ? "bg-red-50 border-red-100 text-red-700"
                  : "bg-emerald-50 border-emerald-100 text-emerald-700"
              }`}
            >
              {pwMsg.text}
            </div>
          )}

          <button type="submit" disabled={pwLoading} className="btn-primary py-2.5 px-5 text-sm">
            {pwLoading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>

      {/* Authorized Applications */}
      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-surface-900 mb-1">Authorized applications</h2>
        <p className="text-sm text-surface-500 mb-6">
          External applications you have granted access to your account. Revoking access will sign you out of that application.
        </p>

        {appsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          </div>
        ) : authorizedApps.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-surface-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-sm text-surface-500">No applications have been authorized yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {authorizedApps.map((app) => (
              <div
                key={app.client_id}
                className="flex items-center justify-between gap-4 p-4 rounded-xl border border-surface-200 bg-surface-50"
              >
                <div className="min-w-0">
                  <p className="font-medium text-surface-900 truncate">{app.display_name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {app.granted_scopes.map((scope) => (
                      <span
                        key={scope}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-50 text-brand-700 border border-brand-100"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-surface-400 mt-1.5">
                    Authorized {new Date(app.granted_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => setRevokeConfirm(app.client_id)}
                  className="shrink-0 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revoke Confirmation Dialog */}
      {revokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-surface-900 mb-2">Revoke access?</h3>
            <p className="text-sm text-surface-600 mb-6">
              This will remove the application&apos;s access to your account and invalidate all its tokens. You can re-authorize it later if needed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRevokeConfirm(null)}
                disabled={revokeLoading}
                className="px-4 py-2 text-sm font-medium text-surface-700 bg-surface-100 rounded-lg hover:bg-surface-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeApp(revokeConfirm)}
                disabled={revokeLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                {revokeLoading ? "Revoking…" : "Revoke access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
