/**
 * Standalone DNS verification cron script.
 *
 * Usage:
 *   node scripts/verify-domains.js
 *
 * Set up as a system cron job (every hour at :05):
 *   5 * * * * cd /path/to/Mailbox && /usr/bin/node scripts/verify-domains.js >> /var/log/mailbox-verify.log 2>&1
 *
 * What it does:
 *   - Connects to MongoDB
 *   - Finds all active domains that are not "verified" (or were verified >24h ago)
 *   - Runs MX + TXT DNS lookups on each
 *   - Updates the domain document with the result
 *   - Prints a summary, then exits
 */

const mongoose = require("mongoose");
const dns = require("dns");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");

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

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mailbox-saas";
const MAIL_HOSTNAME =
  process.env.MAIL_SERVER_HOSTNAME || "mail.yourdomain.com";

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

const CLEAN_NEGATIVE_CODES = new Set(["ENODATA", "ENOTFOUND", "NODATA"]);

// Mirrors lib/models/Domain.js — only the fields we need to read/write.
const DomainSchema = new mongoose.Schema(
  {
    name: String,
    visibility: String,
    ownerId: mongoose.Schema.Types.ObjectId,
    isActive: Boolean,
    verificationStatus: String,
    verificationToken: String,
    isSystemDomain: Boolean,
    dnsRecords: {
      mxVerified: Boolean,
      txtVerified: Boolean,
    },
    verifiedAt: Date,
    isWebsiteApproved: Boolean,
  },
  { timestamps: true }
);

async function verifyOne(domain) {
  let mxOk = false;
  let txtOk = false;
  let mxConclusive = true;
  let txtConclusive = true;

  // MX
  try {
    const records = await resolveMx(domain.name);
    mxOk = records.some(
      (r) =>
        r.exchange.toLowerCase() === MAIL_HOSTNAME.toLowerCase() ||
        r.exchange.toLowerCase() === `${MAIL_HOSTNAME.toLowerCase()}.`
    );
  } catch (err) {
    if (!CLEAN_NEGATIVE_CODES.has(err.code)) mxConclusive = false;
  }

  // TXT
  try {
    const records = await resolveTxt(domain.name);
    const flat = records.map((r) => r.join(""));
    const expected = `mailbox-verify=${domain.verificationToken}`;
    txtOk = flat.some((r) => r === expected);
  } catch (err) {
    if (!CLEAN_NEGATIVE_CODES.has(err.code)) txtConclusive = false;
  }

  const previous = domain.verificationStatus;
  if (!domain.dnsRecords) domain.dnsRecords = {};

  if (mxOk && txtOk) {
    domain.dnsRecords.mxVerified = true;
    domain.dnsRecords.txtVerified = true;
    domain.verificationStatus = "verified";
    domain.verifiedAt = new Date();
  } else if (mxConclusive && txtConclusive) {
    domain.dnsRecords.mxVerified = mxOk;
    domain.dnsRecords.txtVerified = txtOk;
    domain.verificationStatus = "failed";
  }
  // transient — leave previous status

  await domain.save();
  return { previous, current: domain.verificationStatus, mxOk, txtOk };
}

async function main() {
  console.log(`[verify-domains] starting at ${new Date().toISOString()}`);
  await mongoose.connect(MONGODB_URI);
  console.log("[verify-domains] connected to MongoDB");

  const Domain = mongoose.models.Domain || mongoose.model("Domain", DomainSchema);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const domains = await Domain.find({
    isActive: true,
    $or: [
      { verificationStatus: { $ne: "verified" } },
      { verifiedAt: { $lt: oneDayAgo } },
      { verifiedAt: null },
    ],
  });

  console.log(`[verify-domains] checking ${domains.length} domain(s)`);

  let verified = 0;
  let failed = 0;
  let pending = 0;
  const transitions = [];

  for (const d of domains) {
    try {
      const r = await verifyOne(d);
      if (r.previous !== r.current) {
        transitions.push(`${d.name}: ${r.previous} → ${r.current}`);
      }
      if (r.current === "verified") verified += 1;
      else if (r.current === "failed") failed += 1;
      else pending += 1;
    } catch (err) {
      console.error(`[verify-domains] error on ${d.name}:`, err.message);
    }
  }

  console.log(
    `[verify-domains] done — verified: ${verified}, failed: ${failed}, still-pending: ${pending}`
  );
  if (transitions.length > 0) {
    console.log("[verify-domains] transitions:");
    for (const t of transitions) console.log("  " + t);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[verify-domains] fatal:", err);
  process.exit(1);
});
