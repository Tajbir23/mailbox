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
    </div>
  );
}
