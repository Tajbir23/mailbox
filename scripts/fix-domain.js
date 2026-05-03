// One-time script to fix admin-added domains:
// - Set isSystemDomain = true
// - Reset verificationStatus to "verified"
//
// Usage:
//   node scripts/fix-domain.js                    -> fixes default domain
//   node scripts/fix-domain.js example.com        -> fixes a specific domain

const { MongoClient } = require("mongodb");
const path = require("path");
const fs = require("fs");

// ---- load .env.local manually ----
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

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Add it to .env.local.");
  process.exit(1);
}

const targetDomain = process.argv[2] || "genuinesoftmart.store";

async function main() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    // Use the database name from the URI (falls back to "mailBox")
    const db = client.db();

    const result = await db.collection("domains").updateMany(
      { name: targetDomain },
      {
        $set: {
          isSystemDomain: true,
          verificationStatus: "verified",
          "dnsRecords.mxVerified": true,
          "dnsRecords.txtVerified": true,
          verifiedAt: new Date(),
        },
      }
    );

    console.log(`Updated ${result.modifiedCount} domain(s) for "${targetDomain}"`);

    const domain = await db
      .collection("domains")
      .findOne({ name: targetDomain });
    console.log("Domain now:", JSON.stringify(domain, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
