"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

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

function Code({ children }) {
  return (
    <pre className="bg-surface-900 text-emerald-200 text-xs rounded-lg p-4 overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}

function Tabs({ samples }) {
  const langs = Object.keys(samples);
  const [active, setActive] = useState(langs[0]);
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(samples[active]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="my-4">
      <div className="flex items-center justify-between border-b border-surface-200">
        <div className="flex gap-1">
          {langs.map((l) => (
            <button
              key={l}
              onClick={() => setActive(l)}
              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition ${
                active === l
                  ? "bg-surface-900 text-emerald-200"
                  : "bg-surface-100 text-surface-600 hover:bg-surface-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={copyCode}
          className="text-xs px-3 py-1.5 rounded-md bg-surface-100 hover:bg-surface-200 text-surface-700 mr-1 mb-1"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="bg-surface-900 text-emerald-200 text-xs rounded-b-lg rounded-tr-lg p-4 overflow-x-auto -mt-px">
        <code>{samples[active]}</code>
      </pre>
    </div>
  );
}

export default function ApiDocsPage() {
  const [origin, setOrigin] = useState("https://example.com");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const BASE = `${origin}/api/v1`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <Link href="/dashboard" className="text-sm text-surface-500 hover:text-brand-600">
          ← Back to dashboard
        </Link>
        <h1 className="text-4xl font-bold mt-3 mb-2">Mailbox API</h1>
        <p className="text-surface-600 text-lg">
          Manage domains, create email addresses, and read incoming mail from your code — without
          ever logging into the dashboard. Below are step-by-step examples in Node.js, Python and
          PHP.
        </p>
      </div>

      {/* TOC */}
      <nav className="mb-12 p-5 bg-surface-50 rounded-xl border border-surface-200">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">
          On this page
        </p>
        <ul className="text-sm text-brand-600 space-y-1">
          <li><a href="#what-you-need" className="hover:underline">1. What you need before starting</a></li>
          <li><a href="#auth" className="hover:underline">2. Authentication — your API key</a></li>
          <li><a href="#base-url" className="hover:underline">3. Base URL</a></li>
          <li><a href="#first-call" className="hover:underline">4. Make your first call</a></li>
          <li><a href="#domains" className="hover:underline">5. Domains</a></li>
          <li><a href="#mailboxes" className="hover:underline">6. Mailboxes</a></li>
          <li><a href="#emails" className="hover:underline">7. Reading emails</a></li>
          <li><a href="#deleting" className="hover:underline">8. Deleting emails</a></li>
          <li><a href="#full-example" className="hover:underline">9. Full example — wait for an incoming email</a></li>
          <li><a href="#errors" className="hover:underline">10. Error responses</a></li>
        </ul>
      </nav>

      {/* 1. Prereqs */}
      <section id="what-you-need" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">1. What you need before starting</h2>
        <p className="text-surface-700 mb-4">
          To use the API you need three things:
        </p>
        <ol className="list-decimal pl-6 text-surface-700 space-y-2 text-sm">
          <li>
            <b>An account</b> on this Mailbox instance. If you can sign in to the dashboard,
            you're set.
          </li>
          <li>
            <b>An API key</b>. You'll create one in the next step — it's a long secret string
            starting with <code>mb_</code>.
          </li>
          <li>
            <b>A domain to receive mail on</b>. Either a public domain offered by this instance
            (no setup), or your own domain (added + DNS-verified).
          </li>
        </ol>
      </section>

      {/* 2. Auth */}
      <section id="auth" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">2. Authentication — your API key</h2>
        <p className="text-surface-700 mb-3">
          Every request must carry your secret key in an <code>Authorization</code> header.
          Anyone holding the key can act as you, so treat it like a password.
        </p>

        <h3 className="text-lg font-semibold mt-5 mb-2">Create a key</h3>
        <ol className="list-decimal pl-6 text-surface-700 space-y-1 text-sm mb-3">
          <li>
            Open the{" "}
            <Link href="/dashboard/api-keys" className="text-brand-600 underline">
              API keys page
            </Link>
            .
          </li>
          <li>Give the key a name (e.g. <i>"my-script"</i>) and click <b>Create</b>.</li>
          <li>
            <b>Copy it immediately</b> — the full key is shown only once. After you close the
            page, only the first 12 characters are visible.
          </li>
        </ol>

        <h3 className="text-lg font-semibold mt-5 mb-2">Use the key</h3>
        <p className="text-surface-700 text-sm mb-2">
          Add this header to every request:
        </p>
        <Code>{`Authorization: Bearer mb_<your-secret-key>`}</Code>

        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <b>Best practice:</b> store the key in an environment variable
          (<code>MAILBOX_API_KEY</code>), never commit it to git. If a key leaks, revoke it from
          the dashboard — revocation takes effect immediately.
        </div>

        <h3 className="text-lg font-semibold mt-5 mb-2">What a key cannot do</h3>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm">
          <li>Create or list other API keys (you must use the dashboard).</li>
          <li>Change your account email or password.</li>
        </ul>
      </section>

      {/* 3. Base URL */}
      <section id="base-url" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">3. Base URL</h2>
        <p className="text-surface-700 mb-3 text-sm">
          All endpoints in these docs are written without the host — just append them to:
        </p>
        <Code>{BASE}</Code>
        <p className="text-surface-600 mt-2 text-xs">
          (This is auto-detected from the page you're reading right now.)
        </p>
      </section>

      {/* 4. First call */}
      <section id="first-call" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">4. Make your first call</h2>
        <p className="text-surface-700 mb-3 text-sm">
          The simplest request is to list your mailboxes. If your key works, you'll get back a
          JSON array (possibly empty). If not, you'll get a <code>401 Unauthorized</code>.
        </p>

        <h3 className="text-base font-semibold mt-4 mb-2">Try it from your terminal</h3>
        <Code>{`curl ${BASE}/mailboxes \\
  -H "Authorization: Bearer mb_xxx"`}</Code>

        <h3 className="text-base font-semibold mt-5 mb-2">Try it from your code</h3>
        <Tabs
          samples={{
            "Node.js": `// Node 18+ has fetch built-in. For older versions, install node-fetch.
const KEY  = process.env.MAILBOX_API_KEY;
const BASE = "${BASE}";

const res = await fetch(\`\${BASE}/mailboxes\`, {
  headers: { Authorization: \`Bearer \${KEY}\` },
});

if (!res.ok) {
  console.error("Failed:", res.status, await res.text());
  process.exit(1);
}

const mailboxes = await res.json();
console.log(\`You have \${mailboxes.length} mailbox(es).\`);`,
            Python: `# pip install requests
import os, requests

KEY  = os.environ["MAILBOX_API_KEY"]
BASE = "${BASE}"

r = requests.get(f"{BASE}/mailboxes",
                 headers={"Authorization": f"Bearer {KEY}"})
r.raise_for_status()

mailboxes = r.json()
print(f"You have {len(mailboxes)} mailbox(es).")`,
            PHP: `<?php
$key  = getenv("MAILBOX_API_KEY");
$base = "${BASE}";

$ch = curl_init("$base/mailboxes");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status !== 200) {
  fwrite(STDERR, "Failed: $status\\n$body\\n");
  exit(1);
}

$mailboxes = json_decode($body, true);
echo "You have " . count($mailboxes) . " mailbox(es).\\n";`,
          }}
        />
      </section>

      {/* 5. Domains */}
      <section id="domains" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">5. Domains</h2>
        <p className="text-surface-700 text-sm mb-4">
          A <b>domain</b> is the part after the <code>@</code> in an email address. Before you
          can create mailboxes you need a domain that:
        </p>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm mb-4">
          <li>Belongs to you (you added it and verified its DNS), <b>or</b></li>
          <li>Is a public domain offered by this instance (anyone can use it).</li>
        </ul>

        <h3 className="text-lg font-semibold mt-5 mb-2">List the domains you can use</h3>
        <p className="text-surface-700 text-sm mb-2">
          Use <code>?scope=available</code> to get every domain you're allowed to create
          mailboxes on (your own + verified public domains):
        </p>
        <Tabs
          samples={{
            "Node.js": `const res = await fetch(\`\${BASE}/domains?scope=available\`, {
  headers: { Authorization: \`Bearer \${KEY}\` },
});
const domains = await res.json();
domains.forEach((d) => console.log(d.name));`,
            Python: `r = requests.get(
  f"{BASE}/domains",
  headers={"Authorization": f"Bearer {KEY}"},
  params={"scope": "available"},
)
for d in r.json():
    print(d["name"])`,
            PHP: `$ch = curl_init("$base/domains?scope=available");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
$domains = json_decode(curl_exec($ch), true);
curl_close($ch);

foreach ($domains as $d) echo $d["name"] . PHP_EOL;`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Add your own domain</h3>
        <p className="text-surface-700 text-sm mb-2">
          A new domain starts as <i>private</i> and <i>pending</i>. You'll then need to add the
          DNS records (MX + TXT) shown in the dashboard — verification runs automatically.
        </p>
        <Tabs
          samples={{
            "Node.js": `const res = await fetch(\`\${BASE}/domains\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "mydomain.com" }),
});
const domain = await res.json();
console.log("Added:", domain.name, "— status:", domain.verificationStatus);`,
            Python: `r = requests.post(
  f"{BASE}/domains",
  headers={"Authorization": f"Bearer {KEY}"},
  json={"name": "mydomain.com"},
)
domain = r.json()
print("Added:", domain["name"], "— status:", domain["verificationStatus"])`,
            PHP: `$ch = curl_init("$base/domains");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "Authorization: Bearer $key",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS     => json_encode(["name" => "mydomain.com"]),
]);
$domain = json_decode(curl_exec($ch), true);
curl_close($ch);
echo "Added: " . $domain["name"] . " — status: " . $domain["verificationStatus"] . PHP_EOL;`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Domain endpoints reference</h3>
        <Endpoint method="GET" path="/domains">
          <p>List domains you own.</p>
        </Endpoint>
        <Endpoint method="GET" path="/domains?scope=available">
          <p>List every domain you can create mailboxes on.</p>
        </Endpoint>
        <Endpoint method="POST" path="/domains">
          <p>
            Add a new domain. Body: <code>{`{ "name": "mydomain.com" }`}</code>
          </p>
        </Endpoint>
        <Endpoint method="GET" path="/domains/:id">
          <p>Fetch one domain (includes the DNS verification token).</p>
        </Endpoint>
        <Endpoint method="PATCH" path="/domains/:id">
          <p>
            Make verified domain public/private. Body:{" "}
            <code>{`{ "visibility": "public" }`}</code>
          </p>
        </Endpoint>
        <Endpoint method="DELETE" path="/domains/:id">
          <p>Remove a domain you own.</p>
        </Endpoint>
      </section>

      {/* 6. Mailboxes */}
      <section id="mailboxes" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">6. Mailboxes</h2>
        <p className="text-surface-700 text-sm mb-4">
          A <b>mailbox</b> is one email address (like <code>support@example.com</code>) that
          receives incoming mail. Each mailbox you create:
        </p>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm mb-4">
          <li>Has a unique address — picking a taken prefix returns 409.</li>
          <li>Stores incoming emails for 3 days by default (auto-deleted after).</li>
          <li>
            Can optionally be <i>public</i> (anyone with the link can read it) or have an
            auto-delete <code>expiresAt</code>.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mt-5 mb-2">Create a mailbox</h3>
        <p className="text-surface-700 text-sm mb-2">
          Pass <code>prefix</code> (the part before <code>@</code>) and either{" "}
          <code>domain</code> (the name) or <code>domainId</code>.
        </p>
        <Tabs
          samples={{
            "Node.js": `const res = await fetch(\`\${BASE}/mailboxes\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prefix: "support",
    domain: "example.com",
  }),
});

if (res.status === 409) {
  console.log("That address is already taken.");
} else {
  const mailbox = await res.json();
  console.log("Created:", mailbox.emailAddress);
  console.log("ID:", mailbox.id); // save this — you need it to read emails
}`,
            Python: `r = requests.post(
  f"{BASE}/mailboxes",
  headers={"Authorization": f"Bearer {KEY}"},
  json={"prefix": "support", "domain": "example.com"},
)

if r.status_code == 409:
    print("That address is already taken.")
else:
    mailbox = r.json()
    print("Created:", mailbox["emailAddress"])
    print("ID:", mailbox["id"])  # save this`,
            PHP: `$ch = curl_init("$base/mailboxes");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "Authorization: Bearer $key",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS     => json_encode([
    "prefix" => "support",
    "domain" => "example.com",
  ]),
]);
$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status === 409) {
  echo "That address is already taken.\\n";
} else {
  $mailbox = json_decode($body, true);
  echo "Created: " . $mailbox["emailAddress"] . "\\n";
  echo "ID: "      . $mailbox["id"] . "\\n"; // save this
}`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Mailbox endpoints reference</h3>
        <Endpoint method="GET" path="/mailboxes">
          <p>List all mailboxes you own or that are shared with you.</p>
        </Endpoint>
        <Endpoint method="POST" path="/mailboxes">
          <p>Create a mailbox (see example above).</p>
        </Endpoint>
        <Endpoint method="GET" path="/mailboxes/:id">
          <p>Fetch one mailbox.</p>
        </Endpoint>
        <Endpoint method="PATCH" path="/mailboxes/:id">
          <p>Owner only. Update any of these fields:</p>
          <Code>{`{
  "isPublic": true,                          // make readable by anyone with the link
  "expiresAt": "2026-12-31T23:59:00Z",       // auto-delete the mailbox at this time
  "tags": ["work", "vip"]                    // up to 30 tags, each ≤ 40 chars
}`}</Code>
        </Endpoint>
        <Endpoint method="DELETE" path="/mailboxes/:id">
          <p>Owner only. Deletes the mailbox and every email inside it.</p>
        </Endpoint>
      </section>

      {/* 7. Emails */}
      <section id="emails" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">7. Reading emails</h2>
        <p className="text-surface-700 text-sm mb-4">
          Once a mailbox exists, anything sent to its address arrives within seconds. You can
          list, filter, and fetch the full body or attachment metadata.
        </p>

        <h3 className="text-lg font-semibold mt-5 mb-2">List emails (newest first)</h3>
        <p className="text-surface-700 text-sm mb-2">Query parameters you can mix:</p>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm mb-3">
          <li><code>page</code> — page number (default <code>1</code>)</li>
          <li><code>limit</code> — items per page, max <code>100</code> (default <code>30</code>)</li>
          <li><code>unread=true</code> — only return emails you haven't opened yet</li>
        </ul>
        <Tabs
          samples={{
            "Node.js": `const url = new URL(\`\${BASE}/mailboxes/\${mailboxId}/emails\`);
url.searchParams.set("unread", "true");
url.searchParams.set("limit", "50");

const res = await fetch(url, {
  headers: { Authorization: \`Bearer \${KEY}\` },
});
const { emails, total } = await res.json();

console.log(\`\${emails.length} of \${total} unread\`);
for (const e of emails) {
  console.log(\`[\${new Date(e.receivedAt).toLocaleString()}] \${e.from} → \${e.subject}\`);
}`,
            Python: `r = requests.get(
  f"{BASE}/mailboxes/{mailbox_id}/emails",
  headers={"Authorization": f"Bearer {KEY}"},
  params={"unread": "true", "limit": 50},
)
data = r.json()

print(f"{len(data['emails'])} of {data['total']} unread")
for e in data["emails"]:
    print(f"[{e['receivedAt']}] {e['from']} → {e['subject']}")`,
            PHP: `$url = "$base/mailboxes/$mailboxId/emails?unread=true&limit=50";
$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
$data = json_decode(curl_exec($ch), true);
curl_close($ch);

echo count($data["emails"]) . " of " . $data["total"] . " unread\\n";
foreach ($data["emails"] as $e) {
  echo "[" . $e["receivedAt"] . "] " . $e["from"] . " → " . $e["subject"] . PHP_EOL;
}`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Fetch one email's full body</h3>
        <p className="text-surface-700 text-sm mb-2">
          Listing only returns metadata. To read the actual body (text + HTML) of an email, fetch
          it by ID. Doing so also marks it as read.
        </p>
        <Tabs
          samples={{
            "Node.js": `const res = await fetch(
  \`\${BASE}/mailboxes/\${mailboxId}/emails/\${emailId}\`,
  { headers: { Authorization: \`Bearer \${KEY}\` } }
);
const email = await res.json();

console.log("From:    ", email.from);
console.log("Subject: ", email.subject);
console.log("Plain:   ", email.bodyText);
// email.bodyHtml has the HTML body
// email.attachments lists filename + size + contentType (no binary content)`,
            Python: `r = requests.get(
  f"{BASE}/mailboxes/{mailbox_id}/emails/{email_id}",
  headers={"Authorization": f"Bearer {KEY}"},
)
email = r.json()

print("From:    ", email["from"])
print("Subject: ", email["subject"])
print("Plain:   ", email["bodyText"])
# email["bodyHtml"]      — HTML body
# email["attachments"]   — filename + size + contentType`,
            PHP: `$ch = curl_init("$base/mailboxes/$mailboxId/emails/$emailId");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
$email = json_decode(curl_exec($ch), true);
curl_close($ch);

echo "From:    " . $email["from"]     . PHP_EOL;
echo "Subject: " . $email["subject"]  . PHP_EOL;
echo "Plain:   " . $email["bodyText"] . PHP_EOL;
// $email["bodyHtml"]    — HTML body
// $email["attachments"] — filename + size + contentType`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Mark / tag emails</h3>
        <p className="text-surface-700 text-sm mb-2">
          You can mark unread, or attach tags for later filtering:
        </p>
        <Code>{`PATCH /mailboxes/:id/emails/:emailId
{ "isRead": false, "tags": ["follow-up", "billing"] }`}</Code>

        <h3 className="text-lg font-semibold mt-6 mb-2">Email endpoints reference</h3>
        <Endpoint method="GET" path="/mailboxes/:id/emails">
          <p>List emails (paginated). Supports <code>?page</code>, <code>?limit</code>, <code>?unread=true</code>.</p>
        </Endpoint>
        <Endpoint method="GET" path="/mailboxes/:id/emails/:emailId">
          <p>Fetch one email with full body. Auto-marks it read.</p>
        </Endpoint>
        <Endpoint method="PATCH" path="/mailboxes/:id/emails/:emailId">
          <p>Update <code>isRead</code> or <code>tags</code>.</p>
        </Endpoint>
      </section>

      {/* 8. Deleting */}
      <section id="deleting" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">8. Deleting emails</h2>
        <p className="text-surface-700 text-sm mb-2">
          The behaviour depends on whether the calling user owns the mailbox or has it shared
          with them:
        </p>
        <ul className="list-disc pl-6 text-surface-700 space-y-1 text-sm mb-4">
          <li>
            <b>Owner</b> — email is removed for everyone (response includes{" "}
            <code>"scope": "all"</code>).
          </li>
          <li>
            <b>Shared user</b> — email is hidden from your view only; other shared users still
            see it (<code>"scope": "self"</code>).
          </li>
        </ul>

        <h3 className="text-lg font-semibold mt-5 mb-2">Delete one email</h3>
        <Tabs
          samples={{
            "Node.js": `await fetch(
  \`\${BASE}/mailboxes/\${mailboxId}/emails/\${emailId}\`,
  {
    method: "DELETE",
    headers: { Authorization: \`Bearer \${KEY}\` },
  }
);`,
            Python: `requests.delete(
  f"{BASE}/mailboxes/{mailbox_id}/emails/{email_id}",
  headers={"Authorization": f"Bearer {KEY}"},
)`,
            PHP: `$ch = curl_init("$base/mailboxes/$mailboxId/emails/$emailId");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST  => "DELETE",
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
curl_exec($ch);
curl_close($ch);`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Delete many at once</h3>
        <Tabs
          samples={{
            "Node.js": `await fetch(\`\${BASE}/mailboxes/\${mailboxId}/emails\`, {
  method: "DELETE",
  headers: {
    Authorization: \`Bearer \${KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ emailIds: ["id1", "id2", "id3"] }),
});`,
            Python: `requests.delete(
  f"{BASE}/mailboxes/{mailbox_id}/emails",
  headers={"Authorization": f"Bearer {KEY}"},
  json={"emailIds": ["id1", "id2", "id3"]},
)`,
            PHP: `$ch = curl_init("$base/mailboxes/$mailboxId/emails");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST  => "DELETE",
  CURLOPT_HTTPHEADER     => [
    "Authorization: Bearer $key",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS     => json_encode([
    "emailIds" => ["id1", "id2", "id3"],
  ]),
]);
curl_exec($ch);
curl_close($ch);`,
          }}
        />
      </section>

      {/* 9. Full example */}
      <section id="full-example" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">
          9. Full example — wait for an incoming email
        </h2>
        <p className="text-surface-700 text-sm mb-3">
          A common pattern: create a fresh mailbox, print its address, then poll for the first
          message. Useful for OTP capture, signup flows, or webhook testing.
        </p>
        <Tabs
          samples={{
            "Node.js": `// Run with: MAILBOX_API_KEY=mb_xxx node script.js
const KEY  = process.env.MAILBOX_API_KEY;
const BASE = "${BASE}";
const H    = { Authorization: \`Bearer \${KEY}\` };

async function api(path, opts = {}) {
  const res = await fetch(\`\${BASE}\${path}\`, {
    ...opts,
    headers: { ...H, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(\`\${res.status} \${await res.text()}\`);
  return res.json();
}

// 1. create a fresh mailbox
const mb = await api("/mailboxes", {
  method: "POST",
  body: JSON.stringify({
    prefix: \`bot-\${Date.now()}\`,
    domain: "example.com", // change to a domain you can use
  }),
});
console.log("Send mail to:", mb.emailAddress);

// 2. poll until something arrives (max 5 min)
const deadline = Date.now() + 5 * 60 * 1000;
while (Date.now() < deadline) {
  const { emails } = await api(\`/mailboxes/\${mb.id}/emails?unread=true\`);
  if (emails.length) {
    console.log("Got it!");
    console.log("From:    ", emails[0].from);
    console.log("Subject: ", emails[0].subject);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}

console.log("Timed out — no mail received in 5 minutes.");`,
            Python: `# Run with: MAILBOX_API_KEY=mb_xxx python script.py
import os, time, requests

KEY  = os.environ["MAILBOX_API_KEY"]
BASE = "${BASE}"
H    = {"Authorization": f"Bearer {KEY}"}

def api(path, method="GET", json=None):
    r = requests.request(method, BASE + path, headers=H, json=json)
    r.raise_for_status()
    return r.json()

# 1. create a fresh mailbox
mb = api("/mailboxes", "POST", {
    "prefix": f"bot-{int(time.time())}",
    "domain": "example.com",  # change to a domain you can use
})
print("Send mail to:", mb["emailAddress"])

# 2. poll until something arrives (max 5 min)
deadline = time.time() + 5 * 60
while time.time() < deadline:
    data = api(f"/mailboxes/{mb['id']}/emails?unread=true")
    if data["emails"]:
        e = data["emails"][0]
        print("Got it!")
        print("From:    ", e["from"])
        print("Subject: ", e["subject"])
        break
    time.sleep(5)
else:
    print("Timed out — no mail received in 5 minutes.")`,
            PHP: `<?php
// Run with: MAILBOX_API_KEY=mb_xxx php script.php
$key  = getenv("MAILBOX_API_KEY");
$base = "${BASE}";

function api($path, $method = "GET", $body = null) {
  global $base, $key;
  $ch = curl_init($base . $path);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => [
      "Authorization: Bearer $key",
      "Content-Type: application/json",
    ],
  ]);
  if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
  $resp   = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($status >= 400) throw new Exception("$status $resp");
  return json_decode($resp, true);
}

// 1. create a fresh mailbox
$mb = api("/mailboxes", "POST", [
  "prefix" => "bot-" . time(),
  "domain" => "example.com", // change to a domain you can use
]);
echo "Send mail to: " . $mb["emailAddress"] . PHP_EOL;

// 2. poll until something arrives (max 5 min)
$deadline = time() + 5 * 60;
while (time() < $deadline) {
  $data = api("/mailboxes/" . $mb["id"] . "/emails?unread=true");
  if (count($data["emails"]) > 0) {
    $e = $data["emails"][0];
    echo "Got it!\\n";
    echo "From:    " . $e["from"]    . PHP_EOL;
    echo "Subject: " . $e["subject"] . PHP_EOL;
    exit(0);
  }
  sleep(5);
}

echo "Timed out — no mail received in 5 minutes.\\n";`,
          }}
        />
      </section>

      {/* 10. Errors */}
      <section id="errors" className="mb-12">
        <h2 className="text-2xl font-semibold mb-3">10. Error responses</h2>
        <p className="text-surface-700 text-sm mb-3">
          Every error response is JSON in the form{" "}
          <code>{"{ \"error\": \"<message>\" }"}</code> with one of the statuses below.
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-surface-500 border-b border-surface-200">
              <th className="py-2 pr-4">Status</th>
              <th>What it means</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            <tr>
              <td className="py-2 pr-4 font-mono">400</td>
              <td>Bad input — missing field, malformed ID, invalid format.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">401</td>
              <td>Missing, malformed, expired, or revoked API key.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">403</td>
              <td>Authenticated, but you can't do that — e.g. private domain you don't own.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">404</td>
              <td>Resource doesn't exist or you don't have access.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">409</td>
              <td>Conflict — mailbox already taken, domain already registered.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">500</td>
              <td>Server error. Try again; if it persists, contact support.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="border-t border-surface-200 pt-6 mt-10 text-sm text-surface-500">
        Don't have a key yet?{" "}
        <Link href="/dashboard/api-keys" className="text-brand-600 underline">
          Create one in the dashboard →
        </Link>
      </div>
    </div>
  );
}
