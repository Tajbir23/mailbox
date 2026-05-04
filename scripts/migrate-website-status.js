// One-time migration: consolidate the old `isWebsiteApproved` boolean into
// the `websiteStatus` enum, then drop the old field from all documents.
//
// Usage:
//   node scripts/migrate-website-status.js          -> apply migration
//   node scripts/migrate-website-status.js --dry    -> preview without writing

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

const dryRun = process.argv.includes("--dry");

async function main() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const domains = db.collection("domains");

    const promoteFilter = {
      isWebsiteApproved: true,
      websiteStatus: { $ne: "approved" },
    };
    const unsetFilter = { isWebsiteApproved: { $exists: true } };

    const promoteCount = await domains.countDocuments(promoteFilter);
    const unsetCount = await domains.countDocuments(unsetFilter);

    console.log(`Documents to promote to websiteStatus="approved": ${promoteCount}`);
    console.log(`Documents with stale isWebsiteApproved field:    ${unsetCount}`);

    if (dryRun) {
      console.log("\n--dry passed; no writes performed.");
      return;
    }

    const promoted = await domains.updateMany(
      promoteFilter,
      { $set: { websiteStatus: "approved" } }
    );
    console.log(`Promoted ${promoted.modifiedCount} document(s).`);

    const cleaned = await domains.updateMany(
      unsetFilter,
      { $unset: { isWebsiteApproved: "" } }
    );
    console.log(`Removed isWebsiteApproved from ${cleaned.modifiedCount} document(s).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
