/**
 * Clean SSO data script – clears all OIDC + SAML related collections.
 *
 * Removes every document from:
 *   - samlclients         (registered SAML service providers)
 *   - oauthclients        (registered OIDC clients)
 *   - userconsents        (per-user OIDC consent records)
 *   - oidctokens          (issued access / refresh tokens)
 *   - authorizationcodes  (short-lived OIDC auth codes)
 *
 * It does NOT touch users, mailboxes, domains, emails, or site settings.
 *
 * Usage:  npm run clean-sso        (or: node scripts/clean-sso-data.js)
 *
 * ⚠️ This permanently deletes the documents in the collections above.
 */

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// ---- load .env.local manually (same pattern as seed-admin.js) ----
const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mailbox-saas";

// Collections to clear (Mongoose lowercases + pluralizes model names).
const SSO_COLLECTIONS = [
  "samlclients",
  "oauthclients",
  "userconsents",
  "oidctokens",
  "authorizationcodes",
];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const db = mongoose.connection.db;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  for (const name of SSO_COLLECTIONS) {
    if (!existing.includes(name)) {
      console.log(`- ${name}: (collection does not exist, skipped)`);
      continue;
    }
    const res = await db.collection(name).deleteMany({});
    console.log(`- ${name}: deleted ${res.deletedCount} document(s)`);
  }

  console.log("\nSSO data cleanup complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
