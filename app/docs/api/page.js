import Link from "next/link";

export const metadata = {
  title: "API Documentation – Mailbox",
  description:
    "REST API reference for managing mailboxes, emails, domains and your profile programmatically.",
};

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

export default function ApiDocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <Link href="/dashboard" className="text-sm text-surface-500 hover:text-brand-600">
          ← Back
        </Link>
        <h1 className="text-4xl font-bold mt-3 mb-2">Mailbox API</h1>
        <p className="text-surface-600">
          A simple REST API to manage mailboxes, read incoming emails, manage your domains, and
          update your profile — all the things you can do from the dashboard, programmatically.
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
          . Every request must include the key in the <code>Authorization</code> header:
        </p>
        <Code>{`Authorization: Bearer mb_<your-secret-key>`}</Code>
        <ul className="text-sm text-surface-600 mt-4 list-disc pl-5 space-y-1">
          <li>The full key is shown only once at creation — store it securely.</li>
          <li>Keys can be revoked at any time; revocation is immediate.</li>
          <li>An optional <code>expiresAt</code> can be set when creating a key.</li>
          <li>Keys cannot be used to mint or list other keys (session-only).</li>
        </ul>
      </section>

      {/* Quick start */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Quick start</h2>
        <Code>{`# List your mailboxes
curl https://your-host/api/v1/mailboxes \\
  -H "Authorization: Bearer mb_xxx"

# Create a mailbox
curl -X POST https://your-host/api/v1/mailboxes \\
  -H "Authorization: Bearer mb_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"prefix":"hello","domain":"example.com"}'

# Read incoming emails
curl https://your-host/api/v1/mailboxes/<mailboxId>/emails \\
  -H "Authorization: Bearer mb_xxx"`}</Code>
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

      {/* Profile */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Profile</h2>
        <Endpoint method="GET" path="/api/v1/profile">
          <p>Returns the authenticated user's profile.</p>
          <Code>{`{
  "id": "...",
  "name": "Ada",
  "email": "ada@example.com",
  "role": "user",
  "createdAt": "2026-01-15T..."
}`}</Code>
        </Endpoint>
        <Endpoint method="PATCH" path="/api/v1/profile">
          <p>
            Update your name. Email and password changes are blocked when
            authenticating with an API key — sign in to the dashboard for those.
          </p>
          <Code>{`{ "name": "Ada Lovelace" }`}</Code>
        </Endpoint>
      </section>

      {/* Domains */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Domains</h2>
        <Endpoint method="GET" path="/api/v1/domains">
          <p>List domains you own. Use <code>?scope=available</code> to also include verified public domains you can create mailboxes on.</p>
        </Endpoint>
        <Endpoint method="POST" path="/api/v1/domains">
          <p>Add a new domain (private, pending DNS verification).</p>
          <Code>{`{ "name": "mydomain.com" }`}</Code>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/domains/:id">
          <p>Get a single domain you own (includes DNS verification records).</p>
        </Endpoint>
        <Endpoint method="PATCH" path="/api/v1/domains/:id">
          <p>Toggle visibility. Domain must be verified before going public.</p>
          <Code>{`{ "visibility": "public" }`}</Code>
        </Endpoint>
        <Endpoint method="DELETE" path="/api/v1/domains/:id">
          <p>Delete a domain you own.</p>
        </Endpoint>
      </section>

      {/* Mailboxes */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Mailboxes</h2>
        <Endpoint method="GET" path="/api/v1/mailboxes">
          <p>List mailboxes you own or that are shared with you.</p>
        </Endpoint>
        <Endpoint method="POST" path="/api/v1/mailboxes">
          <p>
            Create a new mailbox. Pass either <code>domainId</code> or <code>domain</code> (the
            domain name).
          </p>
          <Code>{`{
  "prefix": "support",
  "domain": "example.com",
  "isPublic": false
}`}</Code>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/mailboxes/:id">
          <p>Get a single mailbox.</p>
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
      </section>

      {/* Emails */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Emails</h2>
        <Endpoint method="GET" path="/api/v1/mailboxes/:id/emails">
          <p>
            List emails in a mailbox. Supports <code>?page</code>, <code>?limit</code> (max 100),
            and <code>?unread=true</code>.
          </p>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/mailboxes/:id/emails/:emailId">
          <p>
            Fetch a single email (full body and attachment metadata). Marks it read automatically.
          </p>
        </Endpoint>
        <Endpoint method="PATCH" path="/api/v1/mailboxes/:id/emails/:emailId">
          <p>
            Update <code>isRead</code> or <code>tags</code>.
          </p>
          <Code>{`{ "isRead": true, "tags": ["follow-up"] }`}</Code>
        </Endpoint>
        <Endpoint method="DELETE" path="/api/v1/mailboxes/:id/emails/:emailId">
          <p>
            Delete an email. Owner deletes globally; shared users hide it from their own view only.
          </p>
        </Endpoint>
        <Endpoint method="DELETE" path="/api/v1/mailboxes/:id/emails">
          <p>Bulk-delete emails.</p>
          <Code>{`{ "emailIds": ["id1", "id2", "id3"] }`}</Code>
        </Endpoint>
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
              <td>Validation failure (missing fields, bad format)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">401</td>
              <td>Missing or invalid API key</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">403</td>
              <td>Authenticated but not allowed (e.g. private domain)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">404</td>
              <td>Resource not found or you do not have access</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">409</td>
              <td>Conflict (duplicate email, taken mailbox, etc.)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">429</td>
              <td>Rate limit exceeded</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">500</td>
              <td>Server error</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Examples */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">JavaScript example</h2>
        <Code>{`const KEY = process.env.MAILBOX_API_KEY;
const BASE = "https://your-host/api/v1";

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Authorization": "Bearer " + KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

// Create a mailbox, then poll for new email
const mb = await api("/mailboxes", {
  method: "POST",
  body: JSON.stringify({ prefix: "bot", domain: "example.com" }),
});

const { emails } = await api(\`/mailboxes/\${mb.id}/emails?unread=true\`);
console.log(\`\${emails.length} unread\`);`}</Code>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3">Python example</h2>
        <Code>{`import os, requests

KEY = os.environ["MAILBOX_API_KEY"]
BASE = "https://your-host/api/v1"
H = {"Authorization": f"Bearer {KEY}"}

mailboxes = requests.get(f"{BASE}/mailboxes", headers=H).json()
for mb in mailboxes:
    print(mb["emailAddress"])`}</Code>
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
