"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Small presentational helpers (mirrors app/docs/api/page.js)        */
/* ------------------------------------------------------------------ */

function Code({ children }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(
        typeof children === "string" ? children : String(children)
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="relative group my-3">
      <button
        onClick={copyCode}
        className="absolute top-2 right-2 text-[11px] px-2.5 py-1 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-200 opacity-0 group-hover:opacity-100 transition"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="bg-surface-900 text-emerald-200 text-xs rounded-lg p-4 overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Endpoint({ method, path, children }) {
  const colors = {
    GET: "bg-emerald-100 text-emerald-700",
    POST: "bg-blue-100 text-blue-700",
    PATCH: "bg-amber-100 text-amber-700",
    DELETE: "bg-red-100 text-red-700",
  };
  return (
    <div className="border border-surface-200 rounded-xl p-5 mb-3">
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-xs font-semibold px-2 py-1 rounded-md ${colors[method]}`}>
          {method}
        </span>
        <code className="font-mono text-sm text-surface-800 break-all">{path}</code>
      </div>
      <div className="text-sm text-surface-700 space-y-2">{children}</div>
    </div>
  );
}

function Note({ tone = "amber", children }) {
  const tones = {
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
  };
  return (
    <div className={`mt-4 p-4 rounded-xl border text-sm ${tones[tone]}`}>{children}</div>
  );
}

/* Picks the right language string/JSX */
function T({ lang, en, bn }) {
  return <>{lang === "bn" ? bn : en}</>;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SsoDocsPage() {
  const [origin, setOrigin] = useState("https://your-domain.com");
  const [lang, setLang] = useState("en"); // "en" | "bn"
  const [access, setAccess] = useState(null); // { visibility, allowed }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/docs-access");
        const data = await res.json();
        if (!cancelled) setAccess(data);
      } catch {
        if (!cancelled) setAccess({ visibility: "disabled", allowed: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ----- Loading spinner ----- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 rounded-full border-[3px] border-surface-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  /* ----- Access restricted ----- */
  if (!access?.allowed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full card p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5 ring-1 ring-red-100">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-surface-900 mb-1">Access Restricted</h1>
          <p className="text-sm text-surface-500 mb-4">অ্যাক্সেস সীমিত</p>
          <p className="text-sm text-surface-600 mb-2">
            This documentation isn&apos;t available for your account right now. Please contact your
            administrator if you believe you should have access.
          </p>
          <p className="text-sm text-surface-600 mb-6">
            এই ডকুমেন্টেশনটি বর্তমানে আপনার অ্যাকাউন্টের জন্য উপলব্ধ নয়। আপনার যদি মনে হয় অ্যাক্সেস
            থাকা উচিত, অনুগ্রহ করে অ্যাডমিনের সঙ্গে যোগাযোগ করুন।
          </p>
          <Link href="/" className="btn-primary !rounded-xl !text-sm inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to home / হোমে ফিরুন
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Documentation content                                              */
  /* ------------------------------------------------------------------ */

  const tt = (en, bn) => (lang === "bn" ? bn : en);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header + language toggle */}
      <div className="mb-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link href="/dashboard" className="text-sm text-surface-500 hover:text-brand-600">
            ← {tt("Back to dashboard", "ড্যাশবোর্ডে ফিরুন")}
          </Link>
          <div className="inline-flex rounded-xl border border-surface-200 p-1 bg-surface-50">
            <button
              onClick={() => setLang("en")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                lang === "en"
                  ? "bg-white text-brand-600 shadow-sm"
                  : "text-surface-500 hover:text-surface-700"
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLang("bn")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                lang === "bn"
                  ? "bg-white text-brand-600 shadow-sm"
                  : "text-surface-500 hover:text-surface-700"
              }`}
            >
              বাংলা
            </button>
          </div>
        </div>

        <h1 className="text-4xl font-bold mt-4 mb-2">
          {tt("Single Sign-On (SSO) Setup", "সিঙ্গেল সাইন-অন (SSO) সেটআপ")}
        </h1>
        <p className="text-surface-600 text-lg">
          {tt(
            'Let your users sign in to other apps with their Mailbox account. This platform acts as an Identity Provider (IdP) supporting both OIDC and SAML 2.0.',
            'আপনার ব্যবহারকারীরা তাদের Mailbox অ্যাকাউন্ট দিয়েই অন্যান্য অ্যাপে সাইন ইন করতে পারবেন। এই প্ল্যাটফর্মটি একটি আইডেন্টিটি প্রোভাইডার (IdP) হিসেবে কাজ করে, যা OIDC এবং SAML 2.0 দুটোই সাপোর্ট করে।'
          )}
        </p>
      </div>

      {/* TOC */}
      <nav className="mb-12 p-5 bg-surface-50 rounded-xl border border-surface-200">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">
          {tt("On this page", "এই পৃষ্ঠায়")}
        </p>
        <ul className="text-sm text-brand-600 space-y-1">
          <li><a href="#overview" className="hover:underline">1. {tt("Overview", "পরিচিতি")}</a></li>
          <li><a href="#prerequisites" className="hover:underline">2. {tt("Prerequisites", "পূর্বশর্ত")}</a></li>
          <li><a href="#oidc" className="hover:underline">3. {tt("OIDC Setup", "OIDC সেটআপ")}</a></li>
          <li><a href="#saml" className="hover:underline">4. {tt("SAML 2.0 Setup", "SAML 2.0 সেটআপ")}</a></li>
          <li><a href="#chatgpt" className="hover:underline">5. {tt("ChatGPT specific notes", "ChatGPT নির্দিষ্ট নোট")}</a></li>
          <li><a href="#troubleshooting" className="hover:underline">6. {tt("Troubleshooting", "সমস্যা সমাধান")}</a></li>
        </ul>
      </nav>

      {/* 1. Overview */}
      <section id="overview" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">1. {tt("Overview", "পরিচিতি")}</h2>
        <T
          lang={lang}
          en={
            <div className="space-y-3 text-surface-700 text-sm">
              <p>
                <b>&ldquo;Sign in with Mailbox&rdquo;</b> lets people use the account they already
                have here to log into other applications (called <i>Service Providers</i>, or SPs).
                Instead of creating yet another username and password, they click one button and are
                signed in.
              </p>
              <p>
                Behind the scenes, this platform is an <b>Identity Provider (IdP)</b>. It proves who
                a user is and hands that proof to the other app. We speak the two industry-standard
                protocols, so almost any modern app can connect:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li><b>OIDC</b> (OpenID Connect) — the modern, JSON/JWT-based protocol built on OAuth 2.0. Best for new integrations.</li>
                <li><b>SAML 2.0</b> — the older XML-based standard still required by many enterprise tools.</li>
              </ul>
              <p>
                Every white-label domain on this platform acts as its <b>own independent IdP</b>.
                The discovery URLs, certificates, and endpoints are all derived from the domain you
                visit, so each customer&apos;s branding and trust boundary stays separate.
              </p>
            </div>
          }
          bn={
            <div className="space-y-3 text-surface-700 text-sm">
              <p>
                <b>&ldquo;Sign in with Mailbox&rdquo;</b> ফিচারটির মাধ্যমে ব্যবহারকারীরা এখানে থাকা
                তাদের বিদ্যমান অ্যাকাউন্ট দিয়েই অন্যান্য অ্যাপ্লিকেশনে (যাদের <i>সার্ভিস প্রোভাইডার</i>
                বা SP বলা হয়) লগইন করতে পারেন। নতুন করে আরেকটি ইউজারনেম ও পাসওয়ার্ড তৈরি না করে তারা
                শুধু একটি বাটনে ক্লিক করলেই সাইন ইন হয়ে যান।
              </p>
              <p>
                পর্দার আড়ালে এই প্ল্যাটফর্মটি একটি <b>আইডেন্টিটি প্রোভাইডার (IdP)</b> হিসেবে কাজ করে।
                এটি একজন ব্যবহারকারীর পরিচয় যাচাই করে এবং সেই প্রমাণ অন্য অ্যাপের কাছে পাঠিয়ে দেয়।
                আমরা ইন্ডাস্ট্রির দুটি স্ট্যান্ডার্ড প্রোটোকল সাপোর্ট করি, ফলে প্রায় যেকোনো আধুনিক অ্যাপ
                সংযুক্ত হতে পারে:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li><b>OIDC</b> (OpenID Connect) — OAuth 2.0-এর উপর তৈরি আধুনিক JSON/JWT-ভিত্তিক প্রোটোকল। নতুন ইন্টিগ্রেশনের জন্য সবচেয়ে উপযুক্ত।</li>
                <li><b>SAML 2.0</b> — পুরোনো XML-ভিত্তিক স্ট্যান্ডার্ড, যা এখনও অনেক এন্টারপ্রাইজ টুলে প্রয়োজন হয়।</li>
              </ul>
              <p>
                এই প্ল্যাটফর্মের প্রতিটি হোয়াইট-লেবেল ডোমেইন তার <b>নিজস্ব স্বাধীন IdP</b> হিসেবে কাজ
                করে। ডিসকভারি URL, সার্টিফিকেট ও এন্ডপয়েন্টগুলো আপনি যে ডোমেইন ভিজিট করছেন তার উপর
                ভিত্তি করেই তৈরি হয়, তাই প্রতিটি গ্রাহকের ব্র্যান্ডিং ও ট্রাস্ট-বাউন্ডারি আলাদা থাকে।
              </p>
            </div>
          }
        />
      </section>

      {/* 2. Prerequisites */}
      <section id="prerequisites" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">2. {tt("Prerequisites", "পূর্বশর্ত")}</h2>
        <p className="text-surface-700 text-sm mb-3">
          {tt(
            "Before you connect any app, make sure you have all of the following:",
            "কোনো অ্যাপ সংযুক্ত করার আগে নিশ্চিত করুন যে আপনার কাছে নিচের সবকিছু আছে:"
          )}
        </p>
        <T
          lang={lang}
          en={
            <ol className="list-decimal pl-6 text-surface-700 space-y-2 text-sm">
              <li>
                <b>A verified, admin-approved custom domain</b> pointed at the platform. Once a
                domain is approved it automatically receives an SSL certificate, which is required
                for every SSO URL to load over HTTPS.
              </li>
              <li>
                <b>Admin access</b> on this platform, so you can register an OAuth client (for OIDC)
                or a SAML service provider.
              </li>
              <li>
                <b>For ChatGPT specifically:</b> an OpenAI <b>Enterprise</b> or <b>Business</b>{" "}
                workspace with <b>Global Admin</b> rights — custom SSO is only configurable on those
                plans.
              </li>
            </ol>
          }
          bn={
            <ol className="list-decimal pl-6 text-surface-700 space-y-2 text-sm">
              <li>
                <b>একটি ভেরিফায়েড, অ্যাডমিন-অনুমোদিত কাস্টম ডোমেইন</b> যা প্ল্যাটফর্মের দিকে পয়েন্ট
                করা আছে। ডোমেইন অনুমোদিত হলে এটি স্বয়ংক্রিয়ভাবে SSL সার্টিফিকেট পায়, যা প্রতিটি SSO URL
                HTTPS-এ লোড হওয়ার জন্য আবশ্যক।
              </li>
              <li>
                এই প্ল্যাটফর্মে <b>অ্যাডমিন অ্যাক্সেস</b>, যাতে আপনি একটি OAuth ক্লায়েন্ট (OIDC-এর জন্য)
                অথবা একটি SAML সার্ভিস প্রোভাইডার রেজিস্টার করতে পারেন।
              </li>
              <li>
                <b>বিশেষ করে ChatGPT-এর জন্য:</b> একটি OpenAI <b>Enterprise</b> বা <b>Business</b>{" "}
                ওয়ার্কস্পেস এবং <b>Global Admin</b> অধিকার — কাস্টম SSO শুধুমাত্র এই প্ল্যানগুলোতেই
                কনফিগার করা যায়।
              </li>
            </ol>
          }
        />
      </section>

      {/* 3. OIDC */}
      <section id="oidc" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">3. {tt("OIDC Setup", "OIDC সেটআপ")}</h2>
        <p className="text-surface-700 text-sm mb-4">
          {tt(
            "OIDC is the recommended option for any app that supports it. The flow is: register a client here, copy the credentials, then paste them into the other app along with the discovery URL.",
            "যে অ্যাপ OIDC সাপোর্ট করে তার জন্য এটিই সুপারিশকৃত পদ্ধতি। ধাপগুলো হলো: এখানে একটি ক্লায়েন্ট রেজিস্টার করুন, ক্রেডেনশিয়াল কপি করুন, তারপর ডিসকভারি URL সহ সেগুলো অন্য অ্যাপে বসিয়ে দিন।"
          )}
        </p>

        <h3 className="text-lg font-semibold mt-5 mb-2">
          {tt("Discovery & key endpoints", "ডিসকভারি ও মূল এন্ডপয়েন্ট")}
        </h3>
        <p className="text-surface-700 text-sm mb-2">
          {tt(
            "Most apps only need the discovery URL — they read everything else from it automatically:",
            "বেশিরভাগ অ্যাপের শুধু ডিসকভারি URL দরকার হয় — বাকি সব তথ্য এটি থেকেই স্বয়ংক্রিয়ভাবে পড়ে নেয়:"
          )}
        </p>
        <Code>{`${origin}/.well-known/openid-configuration`}</Code>
        <p className="text-surface-700 text-sm mt-3 mb-2">
          {tt(
            "The public signing keys (used by apps to verify our tokens) live at:",
            "পাবলিক সাইনিং কী (যা দিয়ে অ্যাপগুলো আমাদের টোকেন যাচাই করে) এখানে পাওয়া যায়:"
          )}
        </p>
        <Code>{`${origin}/.well-known/jwks.json`}</Code>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          {tt("Step 1 — Register an OAuth client (admin)", "ধাপ ১ — একটি OAuth ক্লায়েন্ট রেজিস্টার করুন (অ্যাডমিন)")}
        </h3>
        <T
          lang={lang}
          en={
            <ol className="list-decimal pl-6 text-surface-700 space-y-1 text-sm">
              <li>
                Open <Link href="/admin/oauth-clients" className="text-brand-600 underline">/admin/oauth-clients</Link>.
              </li>
              <li>Enter a <b>Display name</b> (shown to users on the consent screen, e.g. <i>&ldquo;ChatGPT&rdquo;</i>).</li>
              <li>Add the <b>Redirect URI(s)</b> exactly as given by the other app (the SP). These must match character-for-character.</li>
              <li>Choose <b>Confidential</b> client type (a server-side app that can keep a secret).</li>
              <li>Select the scopes <code>openid</code>, <code>profile</code>, and <code>email</code>.</li>
              <li>Save. You&apos;ll receive a <b>Client ID</b> and a <b>Client Secret</b>.</li>
            </ol>
          }
          bn={
            <ol className="list-decimal pl-6 text-surface-700 space-y-1 text-sm">
              <li>
                <Link href="/admin/oauth-clients" className="text-brand-600 underline">/admin/oauth-clients</Link> পৃষ্ঠাটি খুলুন।
              </li>
              <li>একটি <b>Display name</b> দিন (কনসেন্ট স্ক্রিনে ব্যবহারকারীদের দেখানো হয়, যেমন <i>&ldquo;ChatGPT&rdquo;</i>)।</li>
              <li>অন্য অ্যাপ (SP) যে <b>Redirect URI</b> দিয়েছে ঠিক সেভাবেই যোগ করুন। এগুলো অক্ষরে-অক্ষরে মিলতে হবে।</li>
              <li><b>Confidential</b> ক্লায়েন্ট টাইপ বেছে নিন (যে সার্ভার-সাইড অ্যাপ সিক্রেট গোপন রাখতে পারে)।</li>
              <li><code>openid</code>, <code>profile</code> এবং <code>email</code> স্কোপগুলো নির্বাচন করুন।</li>
              <li>সেভ করুন। আপনি একটি <b>Client ID</b> ও একটি <b>Client Secret</b> পাবেন।</li>
            </ol>
          }
        />
        <Note tone="amber">
          {tt(
            "The Client Secret is shown only once. Copy it now and store it somewhere safe — you cannot view it again, only regenerate it.",
            "Client Secret শুধু একবারই দেখানো হয়। এখনই কপি করে নিরাপদ জায়গায় রাখুন — এটি আর দেখা যাবে না, শুধু নতুন করে তৈরি (regenerate) করা যাবে।"
          )}
        </Note>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          {tt("Step 2 — Configure the other app", "ধাপ ২ — অন্য অ্যাপটি কনফিগার করুন")}
        </h3>
        <p className="text-surface-700 text-sm mb-2">
          {tt(
            'In the SP (for example, ChatGPT\u2019s "Custom OIDC" screen), provide:',
            'SP-এ (উদাহরণস্বরূপ ChatGPT-এর "Custom OIDC" স্ক্রিনে) দিন:'
          )}
        </p>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm">
          <li><b>{tt("Discovery URL", "ডিসকভারি URL")}</b> — <code className="break-all">{origin}/.well-known/openid-configuration</code></li>
          <li><b>Client ID</b> — {tt("from step 1", "ধাপ ১ থেকে পাওয়া")}</li>
          <li><b>Client Secret</b> — {tt("from step 1", "ধাপ ১ থেকে পাওয়া")}</li>
          <li><b>{tt("Scopes", "স্কোপ")}</b> — <code>openid profile email</code></li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          {tt("OIDC endpoints reference", "OIDC এন্ডপয়েন্ট রেফারেন্স")}
        </h3>
        <p className="text-surface-600 text-xs mb-3">
          {tt(
            "These are advertised by the discovery document; you rarely need to enter them manually.",
            "এগুলো ডিসকভারি ডকুমেন্টে প্রকাশিত থাকে; ম্যানুয়ালি লেখার দরকার খুব কমই হয়।"
          )}
        </p>
        <Endpoint method="GET" path={`${origin}/api/oidc/authorize`}>
          <p>{tt("Authorization endpoint — where the user is sent to log in and consent.", "অথরাইজেশন এন্ডপয়েন্ট — ব্যবহারকারীকে লগইন ও সম্মতি দেওয়ার জন্য এখানে পাঠানো হয়।")}</p>
        </Endpoint>
        <Endpoint method="POST" path={`${origin}/api/oidc/token`}>
          <p>{tt("Token endpoint — exchanges the authorization code for ID and access tokens.", "টোকেন এন্ডপয়েন্ট — অথরাইজেশন কোডকে ID ও অ্যাক্সেস টোকেনের সাথে বিনিময় করে।")}</p>
        </Endpoint>
        <Endpoint method="GET" path={`${origin}/api/oidc/userinfo`}>
          <p>{tt("UserInfo endpoint — returns the signed-in user\u2019s profile claims.", "UserInfo এন্ডপয়েন্ট — সাইন-ইন করা ব্যবহারকারীর প্রোফাইল ক্লেইম ফেরত দেয়।")}</p>
        </Endpoint>
      </section>

      {/* 4. SAML */}
      <section id="saml" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">4. {tt("SAML 2.0 Setup", "SAML 2.0 সেটআপ")}</h2>
        <p className="text-surface-700 text-sm mb-4">
          {tt(
            "Use SAML when the other app doesn\u2019t support OIDC. The principle is the same: register the SP here, then exchange metadata so both sides trust each other.",
            "অন্য অ্যাপ যখন OIDC সাপোর্ট করে না তখন SAML ব্যবহার করুন। নীতিটি একই: এখানে SP রেজিস্টার করুন, তারপর মেটাডেটা বিনিময় করুন যাতে দুই পক্ষই একে অপরকে বিশ্বাস করে।"
          )}
        </p>

        <h3 className="text-lg font-semibold mt-5 mb-2">
          {tt("IdP metadata", "IdP মেটাডেটা")}
        </h3>
        <p className="text-surface-700 text-sm mb-2">
          {tt(
            "Everything an SP needs about us — the entityID, SSO URL, and signing certificate — is contained in one metadata document. This URL is also our entityID:",
            "একটি SP-এর আমাদের সম্পর্কে যা যা দরকার — entityID, SSO URL ও সাইনিং সার্টিফিকেট — সবকিছু একটি মেটাডেটা ডকুমেন্টে থাকে। এই URL-টিই আমাদের entityID:"
          )}
        </p>
        <Code>{`${origin}/api/saml/metadata`}</Code>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          {tt("Step 1 — Register a SAML SP (admin)", "ধাপ ১ — একটি SAML SP রেজিস্টার করুন (অ্যাডমিন)")}
        </h3>
        <p className="text-surface-700 text-sm mb-2">
          {tt(
            "Open ", "প্রথমে "
          )}
          <Link href="/admin/saml-clients" className="text-brand-600 underline">/admin/saml-clients</Link>
          {tt(" and provide the values from the other app\u2019s metadata:", " খুলুন এবং অন্য অ্যাপের মেটাডেটা থেকে নিচের মানগুলো দিন:")}
        </p>
        <T
          lang={lang}
          en={
            <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm">
              <li><b>SP Entity ID</b> — the unique identifier of the other app.</li>
              <li><b>ACS URL(s)</b> — the Assertion Consumer Service URL(s) where we POST the login response.</li>
              <li><b>NameID format</b> — use <code>emailAddress</code> so the user is identified by their email.</li>
              <li><b>Attribute mapping</b> (optional) — only if the SP expects custom attribute names.</li>
            </ul>
          }
          bn={
            <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm">
              <li><b>SP Entity ID</b> — অন্য অ্যাপের অনন্য শনাক্তকারী।</li>
              <li><b>ACS URL(s)</b> — Assertion Consumer Service URL, যেখানে আমরা লগইন রেসপন্স POST করি।</li>
              <li><b>NameID format</b> — <code>emailAddress</code> ব্যবহার করুন, যাতে ব্যবহারকারী তার ইমেইল দিয়ে শনাক্ত হয়।</li>
              <li><b>Attribute mapping</b> (ঐচ্ছিক) — শুধুমাত্র যদি SP কাস্টম অ্যাট্রিবিউট নাম প্রত্যাশা করে।</li>
            </ul>
          }
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">
          {tt("Step 2 — Configure the other app", "ধাপ ২ — অন্য অ্যাপটি কনফিগার করুন")}
        </h3>
        <p className="text-surface-700 text-sm mb-2">
          {tt(
            'In the SP (for example, ChatGPT\u2019s "Custom SAML" screen), the easiest path is to paste our metadata URL and let it auto-fill:',
            'SP-এ (উদাহরণস্বরূপ ChatGPT-এর "Custom SAML" স্ক্রিনে) সবচেয়ে সহজ উপায় হলো আমাদের মেটাডেটা URL বসিয়ে দেওয়া, যাতে এটি স্বয়ংক্রিয়ভাবে পূরণ হয়:'
          )}
        </p>
        <Code>{`${origin}/api/saml/metadata`}</Code>
        <p className="text-surface-700 text-sm mt-3 mb-2">
          {tt(
            "If the app requires manual entry instead, all three values below are inside that same metadata document:",
            "যদি অ্যাপটি ম্যানুয়াল এন্ট্রি চায়, নিচের তিনটি মানই ওই একই মেটাডেটা ডকুমেন্টের ভেতরে আছে:"
          )}
        </p>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm">
          <li><b>entityID / Issuer</b> — <code className="break-all">{origin}/api/saml/metadata</code></li>
          <li><b>{tt("SSO URL", "SSO URL")}</b> — <code className="break-all">{origin}/api/saml/sso</code></li>
          <li><b>{tt("Signing certificate", "সাইনিং সার্টিফিকেট")}</b> — {tt("the X.509 certificate embedded in the metadata.", "মেটাডেটার ভেতরে এম্বেড করা X.509 সার্টিফিকেট।")}</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          {tt("Attributes we send", "আমরা যে অ্যাট্রিবিউটগুলো পাঠাই")}
        </h3>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm">
          <li><b>email</b> — {tt("always sent; also used as the NameID.", "সবসময় পাঠানো হয়; NameID হিসেবেও ব্যবহৃত হয়।")}</li>
          <li><b>givenName</b> — {tt("the user\u2019s first name, when available.", "ব্যবহারকারীর প্রথম নাম, যদি থাকে।")}</li>
          <li><b>surname</b> — {tt("the user\u2019s last name, when available.", "ব্যবহারকারীর শেষ নাম, যদি থাকে।")}</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          {tt("SAML endpoints reference", "SAML এন্ডপয়েন্ট রেফারেন্স")}
        </h3>
        <Endpoint method="GET" path={`${origin}/api/saml/metadata`}>
          <p>{tt("IdP metadata document (also the entityID).", "IdP মেটাডেটা ডকুমেন্ট (এটিই entityID)।")}</p>
        </Endpoint>
        <Endpoint method="GET" path={`${origin}/api/saml/sso`}>
          <p>{tt("Single Sign-On endpoint. Supports both HTTP-Redirect and HTTP-POST bindings.", "সিঙ্গেল সাইন-অন এন্ডপয়েন্ট। HTTP-Redirect ও HTTP-POST — দুটি বাইন্ডিংই সাপোর্ট করে।")}</p>
        </Endpoint>
      </section>

      {/* 5. ChatGPT */}
      <section id="chatgpt" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">5. {tt("ChatGPT specific notes", "ChatGPT নির্দিষ্ট নোট")}</h2>
        <T
          lang={lang}
          en={
            <ol className="list-decimal pl-6 text-surface-700 space-y-2 text-sm">
              <li>
                Go to <code>admin.openai.com/identity</code> → <b>Set up SSO</b> → choose either{" "}
                <b>Custom OIDC</b> or <b>Custom SAML</b>, then enter the values from the matching
                section above.
              </li>
              <li>
                <b>Verify your domain in OpenAI&apos;s console.</b> This is a separate step: OpenAI
                asks you to add a TXT record to prove you own the email domain. It is unrelated to
                the DNS records you added on this platform.
              </li>
              <li>
                <b>Global Admin accounts may bypass SSO.</b> When testing, log in as a regular
                (non-admin) user — otherwise you may be sent down the normal login path instead of
                SSO.
              </li>
              <li>
                Test using the <b>Application login URL</b> that OpenAI provides, ideally in an
                incognito window so no existing session interferes.
              </li>
            </ol>
          }
          bn={
            <ol className="list-decimal pl-6 text-surface-700 space-y-2 text-sm">
              <li>
                <code>admin.openai.com/identity</code> → <b>Set up SSO</b> → <b>Custom OIDC</b> অথবা{" "}
                <b>Custom SAML</b> বেছে নিন, তারপর উপরের সংশ্লিষ্ট অংশ থেকে মানগুলো দিন।
              </li>
              <li>
                <b>OpenAI-এর কনসোলে আপনার ডোমেইন ভেরিফাই করুন।</b> এটি একটি আলাদা ধাপ: OpenAI আপনাকে
                ইমেইল ডোমেইনের মালিকানা প্রমাণের জন্য একটি TXT রেকর্ড যোগ করতে বলবে। এটি এই প্ল্যাটফর্মে
                যোগ করা DNS রেকর্ডের সাথে সম্পর্কিত নয়।
              </li>
              <li>
                <b>Global Admin অ্যাকাউন্ট SSO এড়িয়ে যেতে পারে।</b> টেস্ট করার সময় একজন সাধারণ
                (নন-অ্যাডমিন) ব্যবহারকারী হিসেবে লগইন করুন — না হলে আপনাকে SSO-এর বদলে স্বাভাবিক লগইন
                পথে পাঠানো হতে পারে।
              </li>
              <li>
                OpenAI যে <b>Application login URL</b> দেয় তা দিয়ে টেস্ট করুন, বিশেষত একটি ইনকগনিটো
                উইন্ডোতে — যাতে কোনো বিদ্যমান সেশন বাধা না দেয়।
              </li>
            </ol>
          }
        />
      </section>

      {/* 6. Troubleshooting */}
      <section id="troubleshooting" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">6. {tt("Troubleshooting", "সমস্যা সমাধান")}</h2>

        <div className="space-y-4">
          <div className="border border-surface-200 rounded-xl p-5">
            <h3 className="text-base font-semibold mb-2">
              {tt("Discovery or metadata URL won\u2019t load", "ডিসকভারি বা মেটাডেটা URL লোড হচ্ছে না")}
            </h3>
            <T
              lang={lang}
              en={
                <p className="text-sm text-surface-700">
                  The domain must be <b>admin-approved</b> so it has an automatic SSL certificate.
                  Also confirm the DNS <b>A record</b> for the domain points to the server&apos;s IP
                  address. Until both are true, HTTPS requests to the discovery/metadata URL will
                  fail.
                </p>
              }
              bn={
                <p className="text-sm text-surface-700">
                  ডোমেইনটি <b>অ্যাডমিন-অনুমোদিত</b> হতে হবে, যাতে এটি স্বয়ংক্রিয় SSL সার্টিফিকেট পায়।
                  পাশাপাশি নিশ্চিত করুন ডোমেইনের DNS <b>A রেকর্ড</b> সার্ভারের IP ঠিকানার দিকে পয়েন্ট
                  করছে। এই দুটি না হওয়া পর্যন্ত ডিসকভারি/মেটাডেটা URL-এ HTTPS রিকোয়েস্ট ব্যর্থ হবে।
                </p>
              }
            />
          </div>

          <div className="border border-surface-200 rounded-xl p-5">
            <h3 className="text-base font-semibold mb-2">
              {tt("Users get an OTP instead of SSO", "ব্যবহারকারীরা SSO-এর বদলে OTP পাচ্ছেন")}
            </h3>
            <T
              lang={lang}
              en={
                <ul className="list-disc pl-6 text-sm text-surface-700 space-y-1">
                  <li>The domain isn&apos;t verified in the SP yet (e.g. OpenAI&apos;s TXT check).</li>
                  <li>You&apos;re testing with a Global Admin account that bypasses SSO — use a regular user.</li>
                  <li>SSO isn&apos;t set to required/enabled for the workspace in the SP&apos;s settings.</li>
                </ul>
              }
              bn={
                <ul className="list-disc pl-6 text-sm text-surface-700 space-y-1">
                  <li>SP-এ ডোমেইনটি এখনও ভেরিফায়েড নয় (যেমন OpenAI-এর TXT যাচাই)।</li>
                  <li>আপনি একটি Global Admin অ্যাকাউন্ট দিয়ে টেস্ট করছেন যা SSO এড়িয়ে যায় — একজন সাধারণ ব্যবহারকারী ব্যবহার করুন।</li>
                  <li>SP-এর সেটিংসে ওয়ার্কস্পেসটির জন্য SSO required/enabled করা নেই।</li>
                </ul>
              }
            />
          </div>

          <div className="border border-surface-200 rounded-xl p-5">
            <h3 className="text-base font-semibold mb-2">
              {tt("SAML signature is rejected", "SAML সিগনেচার প্রত্যাখ্যাত হচ্ছে")}
            </h3>
            <T
              lang={lang}
              en={
                <p className="text-sm text-surface-700">
                  This almost always means the certificate the SP has on file doesn&apos;t match the
                  one in our current metadata. Re-fetch our metadata URL and make sure the signing
                  certificate the SP trusts is exactly the one published there.
                </p>
              }
              bn={
                <p className="text-sm text-surface-700">
                  এটি প্রায় সবসময়ই বোঝায় যে SP-এর কাছে থাকা সার্টিফিকেটটি আমাদের বর্তমান মেটাডেটার
                  সার্টিফিকেটের সাথে মিলছে না। আমাদের মেটাডেটা URL আবার ফেচ করুন এবং নিশ্চিত করুন SP যে
                  সাইনিং সার্টিফিকেট বিশ্বাস করছে সেটি ঠিক সেখানে প্রকাশিতটির সাথে অভিন্ন।
                </p>
              }
            />
          </div>
        </div>
      </section>

      <div className="border-t border-surface-200 pt-6 mt-10 text-sm text-surface-500">
        {tt(
          "Need to manage your SSO clients?",
          "আপনার SSO ক্লায়েন্ট পরিচালনা করতে চান?"
        )}{" "}
        <Link href="/admin/oauth-clients" className="text-brand-600 underline">
          {tt("OAuth clients", "OAuth ক্লায়েন্ট")}
        </Link>{" "}
        ·{" "}
        <Link href="/admin/saml-clients" className="text-brand-600 underline">
          {tt("SAML clients", "SAML ক্লায়েন্ট")}
        </Link>
      </div>
    </div>
  );
}
