"use client";

import Link from "next/link";
import { useState } from "react";

function Endpoint({ method, path, children }) {
  const colors = {
    GET: "bg-emerald-100 text-emerald-700",
    POST: "bg-blue-100 text-blue-700",
    PATCH: "bg-amber-100 text-amber-700",
    DELETE: "bg-red-100 text-red-700",
  };
  return (
    <div className="border border-surface-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-xs font-semibold px-2 py-1 rounded-md ${colors[method]}`}>
          {method}
        </span>
        <code className="font-mono text-sm text-surface-800">{path}</code>
      </div>
      <div className="text-sm text-surface-700 space-y-3">{children}</div>
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
  return (
    <div className="my-4">
      <div className="flex gap-1 border-b border-surface-200 mb-0">
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
      <pre className="bg-surface-900 text-emerald-200 text-xs rounded-b-lg rounded-tr-lg p-4 overflow-x-auto -mt-px">
        <code>{samples[active]}</code>
      </pre>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <Link href="/dashboard" className="text-sm text-surface-500 hover:text-brand-600">
          ← Back
        </Link>
        <h1 className="text-4xl font-bold mt-3 mb-2">Mailbox API</h1>
        <p className="text-surface-600">
          REST API to manage domains, create mailboxes, and read or delete incoming emails
          programmatically. Examples in Node.js, Python and PHP.
        </p>
      </div>

      {/* Authentication */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Authentication</h2>
        <p className="text-surface-700 mb-4">
          Generate an API key from your{" "}
          <Link href="/dashboard/api-keys" className="text-brand-600 underline">
            API keys page
          </Link>
          . Pass it in the <code>Authorization</code> header on every request:
        </p>
        <Code>{`Authorization: Bearer mb_<your-secret-key>`}</Code>
        <ul className="text-sm text-surface-600 mt-4 list-disc pl-5 space-y-1">
          <li>The full key is shown only once at creation — store it securely.</li>
          <li>Keys can be revoked at any time; revocation is immediate.</li>
          <li>You can set an optional expiry on a key.</li>
          <li>API keys cannot mint or list other keys (session-only).</li>
        </ul>
      </section>

      {/* Base URL */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Base URL</h2>
        <Code>{`/api/v1`}</Code>
        <p className="text-sm text-surface-600 mt-2">
          All endpoints below are relative to this prefix. Responses are JSON. Errors return{" "}
          <code>{"{ \"error\": \"...\" }"}</code> with the appropriate HTTP status.
        </p>
      </section>

      {/* Quick start */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Quick start</h2>
        <p className="text-sm text-surface-600 mb-3">
          List your mailboxes — the simplest call to verify your key works.
        </p>
        <Tabs
          samples={{
            "Node.js": `import fetch from "node-fetch";

const KEY = process.env.MAILBOX_API_KEY;
const BASE = "https://your-host/api/v1";

const res = await fetch(\`\${BASE}/mailboxes\`, {
  headers: { Authorization: \`Bearer \${KEY}\` },
});
console.log(await res.json());`,
            Python: `import os, requests

KEY = os.environ["MAILBOX_API_KEY"]
BASE = "https://your-host/api/v1"

r = requests.get(f"{BASE}/mailboxes",
                 headers={"Authorization": f"Bearer {KEY}"})
print(r.json())`,
            PHP: `<?php
$key  = getenv("MAILBOX_API_KEY");
$base = "https://your-host/api/v1";

$ch = curl_init("$base/mailboxes");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
$body = curl_exec($ch);
curl_close($ch);
print_r(json_decode($body, true));`,
          }}
        />
      </section>

      {/* Domains */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Domains</h2>
        <p className="text-sm text-surface-600 mb-3">
          You need a verified domain before you can create a mailbox on it. Use{" "}
          <code>scope=available</code> to also list verified public domains anyone can use.
        </p>
        <Endpoint method="GET" path="/api/v1/domains">
          <p>List domains you own.</p>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/domains?scope=available">
          <p>List domains you can create mailboxes on (your own + verified public).</p>
        </Endpoint>
        <Endpoint method="POST" path="/api/v1/domains">
          <p>Add a new domain. Starts as private + pending DNS verification.</p>
          <Code>{`{ "name": "mydomain.com" }`}</Code>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/domains/:id">
          <p>Fetch a single domain (includes the DNS verification token).</p>
        </Endpoint>
        <Endpoint method="PATCH" path="/api/v1/domains/:id">
          <p>Toggle visibility. Only verified domains can be made public.</p>
          <Code>{`{ "visibility": "public" }`}</Code>
        </Endpoint>
        <Endpoint method="DELETE" path="/api/v1/domains/:id">
          <p>Delete a domain you own.</p>
        </Endpoint>

        <h3 className="text-lg font-semibold mt-6 mb-2">Add a domain</h3>
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
console.log(await res.json());`,
            Python: `r = requests.post(
  f"{BASE}/domains",
  headers={"Authorization": f"Bearer {KEY}"},
  json={"name": "mydomain.com"},
)
print(r.json())`,
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
$body = curl_exec($ch);
curl_close($ch);
print_r(json_decode($body, true));`,
          }}
        />
      </section>

      {/* Mailboxes */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Mailboxes</h2>
        <p className="text-sm text-surface-600 mb-3">
          A mailbox is an email address (<code>prefix@domain</code>) that receives mail. You can
          create unlimited mailboxes on any domain you have access to.
        </p>
        <Endpoint method="GET" path="/api/v1/mailboxes">
          <p>List mailboxes you own or that are shared with you.</p>
        </Endpoint>
        <Endpoint method="POST" path="/api/v1/mailboxes">
          <p>
            Create a mailbox. Pass either <code>domainId</code> or <code>domain</code> (the
            domain name).
          </p>
          <Code>{`{
  "prefix": "support",
  "domain": "example.com",
  "isPublic": false
}`}</Code>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/mailboxes/:id">
          <p>Fetch a single mailbox.</p>
        </Endpoint>
        <Endpoint method="PATCH" path="/api/v1/mailboxes/:id">
          <p>
            Update <code>isPublic</code>, <code>expiresAt</code> (auto-delete timer), or{" "}
            <code>tags</code>. Owner only.
          </p>
          <Code>{`{
  "isPublic": true,
  "expiresAt": "2026-12-31T23:59:00Z",
  "tags": ["work", "vip"]
}`}</Code>
        </Endpoint>
        <Endpoint method="DELETE" path="/api/v1/mailboxes/:id">
          <p>Delete a mailbox and all of its emails. Owner only.</p>
        </Endpoint>

        <h3 className="text-lg font-semibold mt-6 mb-2">Create a mailbox</h3>
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
const mailbox = await res.json();
console.log(mailbox.emailAddress); // support@example.com`,
            Python: `r = requests.post(
  f"{BASE}/mailboxes",
  headers={"Authorization": f"Bearer {KEY}"},
  json={"prefix": "support", "domain": "example.com"},
)
mailbox = r.json()
print(mailbox["emailAddress"])  # support@example.com`,
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
$mailbox = json_decode(curl_exec($ch), true);
curl_close($ch);
echo $mailbox["emailAddress"]; // support@example.com`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Delete a mailbox</h3>
        <Tabs
          samples={{
            "Node.js": `await fetch(\`\${BASE}/mailboxes/\${id}\`, {
  method: "DELETE",
  headers: { Authorization: \`Bearer \${KEY}\` },
});`,
            Python: `requests.delete(
  f"{BASE}/mailboxes/{id}",
  headers={"Authorization": f"Bearer {KEY}"},
)`,
            PHP: `$ch = curl_init("$base/mailboxes/$id");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST  => "DELETE",
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
curl_exec($ch);
curl_close($ch);`,
          }}
        />
      </section>

      {/* Emails */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Emails</h2>
        <p className="text-sm text-surface-600 mb-3">
          Inbound emails arrive in real time and are auto-deleted after 3 days unless you delete
          them sooner.
        </p>
        <Endpoint method="GET" path="/api/v1/mailboxes/:id/emails">
          <p>
            List emails. Supports <code>?page</code>, <code>?limit</code> (max 100), and{" "}
            <code>?unread=true</code>.
          </p>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/mailboxes/:id/emails/:emailId">
          <p>Fetch a single email (full body + attachment metadata). Auto-marks as read.</p>
        </Endpoint>
        <Endpoint method="PATCH" path="/api/v1/mailboxes/:id/emails/:emailId">
          <p>
            Update <code>isRead</code> or <code>tags</code>.
          </p>
          <Code>{`{ "isRead": true, "tags": ["follow-up"] }`}</Code>
        </Endpoint>
        <Endpoint method="DELETE" path="/api/v1/mailboxes/:id/emails/:emailId">
          <p>
            Delete a single email. Owner removes for everyone; shared users hide it from their own
            view only.
          </p>
        </Endpoint>
        <Endpoint method="DELETE" path="/api/v1/mailboxes/:id/emails">
          <p>Bulk-delete emails.</p>
          <Code>{`{ "emailIds": ["id1", "id2", "id3"] }`}</Code>
        </Endpoint>

        <h3 className="text-lg font-semibold mt-6 mb-2">List unread emails</h3>
        <Tabs
          samples={{
            "Node.js": `const res = await fetch(
  \`\${BASE}/mailboxes/\${mailboxId}/emails?unread=true&limit=50\`,
  { headers: { Authorization: \`Bearer \${KEY}\` } }
);
const { emails, total } = await res.json();
for (const e of emails) {
  console.log(e.from, "→", e.subject);
}`,
            Python: `r = requests.get(
  f"{BASE}/mailboxes/{mailbox_id}/emails",
  headers={"Authorization": f"Bearer {KEY}"},
  params={"unread": "true", "limit": 50},
)
data = r.json()
for e in data["emails"]:
    print(e["from"], "→", e["subject"])`,
            PHP: `$url = "$base/mailboxes/$mailboxId/emails?unread=true&limit=50";
$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
$data = json_decode(curl_exec($ch), true);
curl_close($ch);

foreach ($data["emails"] as $e) {
  echo $e["from"] . " → " . $e["subject"] . PHP_EOL;
}`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Fetch full email body</h3>
        <Tabs
          samples={{
            "Node.js": `const res = await fetch(
  \`\${BASE}/mailboxes/\${mailboxId}/emails/\${emailId}\`,
  { headers: { Authorization: \`Bearer \${KEY}\` } }
);
const email = await res.json();
console.log(email.bodyText);`,
            Python: `r = requests.get(
  f"{BASE}/mailboxes/{mailbox_id}/emails/{email_id}",
  headers={"Authorization": f"Bearer {KEY}"},
)
print(r.json()["bodyText"])`,
            PHP: `$ch = curl_init("$base/mailboxes/$mailboxId/emails/$emailId");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["Authorization: Bearer $key"],
]);
$email = json_decode(curl_exec($ch), true);
curl_close($ch);
echo $email["bodyText"];`,
          }}
        />

        <h3 className="text-lg font-semibold mt-6 mb-2">Delete an email</h3>
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

        <h3 className="text-lg font-semibold mt-6 mb-2">Bulk delete emails</h3>
        <Tabs
          samples={{
            "Node.js": `await fetch(
  \`\${BASE}/mailboxes/\${mailboxId}/emails\`,
  {
    method: "DELETE",
    headers: {
      Authorization: \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emailIds: ids }),
  }
);`,
            Python: `requests.delete(
  f"{BASE}/mailboxes/{mailbox_id}/emails",
  headers={"Authorization": f"Bearer {KEY}"},
  json={"emailIds": ids},
)`,
            PHP: `$ch = curl_init("$base/mailboxes/$mailboxId/emails");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST  => "DELETE",
  CURLOPT_HTTPHEADER     => [
    "Authorization: Bearer $key",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS     => json_encode(["emailIds" => $ids]),
]);
curl_exec($ch);
curl_close($ch);`,
          }}
        />
      </section>

      {/* Polling pattern */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Full example — poll for new mail</h2>
        <p className="text-sm text-surface-600 mb-3">
          Create a mailbox, then poll for unread mail every 5 seconds until something arrives.
        </p>
        <Tabs
          samples={{
            "Node.js": `import fetch from "node-fetch";

const KEY  = process.env.MAILBOX_API_KEY;
const BASE = "https://your-host/api/v1";
const H    = { Authorization: \`Bearer \${KEY}\` };

const create = await fetch(\`\${BASE}/mailboxes\`, {
  method: "POST",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix: "bot-" + Date.now(), domain: "example.com" }),
}).then((r) => r.json());

console.log("Send mail to:", create.emailAddress);

while (true) {
  const { emails } = await fetch(
    \`\${BASE}/mailboxes/\${create.id}/emails?unread=true\`,
    { headers: H }
  ).then((r) => r.json());

  if (emails.length) {
    console.log("Got:", emails[0].subject);
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}`,
            Python: `import os, time, requests

KEY  = os.environ["MAILBOX_API_KEY"]
BASE = "https://your-host/api/v1"
H    = {"Authorization": f"Bearer {KEY}"}

mb = requests.post(
  f"{BASE}/mailboxes",
  headers=H,
  json={"prefix": f"bot-{int(time.time())}", "domain": "example.com"},
).json()

print("Send mail to:", mb["emailAddress"])

while True:
    r = requests.get(
      f"{BASE}/mailboxes/{mb['id']}/emails",
      headers=H,
      params={"unread": "true"},
    )
    emails = r.json()["emails"]
    if emails:
        print("Got:", emails[0]["subject"])
        break
    time.sleep(5)`,
            PHP: `<?php
$key  = getenv("MAILBOX_API_KEY");
$base = "https://your-host/api/v1";
$H    = ["Authorization: Bearer $key", "Content-Type: application/json"];

function api($url, $method = "GET", $body = null, $H = []) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $H,
  ]);
  if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
  $r = json_decode(curl_exec($ch), true);
  curl_close($ch);
  return $r;
}

$mb = api("$base/mailboxes", "POST",
  ["prefix" => "bot-" . time(), "domain" => "example.com"], $H);

echo "Send mail to: " . $mb["emailAddress"] . PHP_EOL;

while (true) {
  $data = api("$base/mailboxes/" . $mb["id"] . "/emails?unread=true",
              "GET", null, $H);
  if (count($data["emails"]) > 0) {
    echo "Got: " . $data["emails"][0]["subject"] . PHP_EOL;
    break;
  }
  sleep(5);
}`,
          }}
        />
      </section>

      {/* Errors */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Errors</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-surface-500 border-b border-surface-200">
              <th className="py-2 pr-4">Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            <tr>
              <td className="py-2 pr-4 font-mono">400</td>
              <td>Validation failure (missing fields, bad ID, bad format)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">401</td>
              <td>Missing or invalid API key</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">403</td>
              <td>Authenticated but not allowed (e.g. private domain you don't own)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">404</td>
              <td>Resource not found or no access</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">409</td>
              <td>Conflict (mailbox already taken, domain already registered)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">500</td>
              <td>Server error</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="border-t border-surface-200 pt-6 mt-10 text-sm text-surface-500">
        Need a key?{" "}
        <Link href="/dashboard/api-keys" className="text-brand-600 underline">
          Create one in the dashboard →
        </Link>
      </div>
    </div>
  );
}
