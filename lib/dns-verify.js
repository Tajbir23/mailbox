// Shared domain DNS verification logic.
// Used by:
//   - user-side /api/user/domains/[id]/verify
//   - admin-side /api/admin/domains/[id]/verify
//   - cron endpoint /api/cron/verify-domains
//   - standalone script scripts/verify-domains.js

import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

export const MAIL_HOSTNAME =
  process.env.MAIL_SERVER_HOSTNAME || "mail.yourdomain.com";

// DNS error codes that mean "we got a clean answer: no records exist"
// (vs. transient codes like ETIMEOUT/EAI_AGAIN where we shouldn't trust the result)
const CLEAN_NEGATIVE_CODES = new Set(["ENODATA", "ENOTFOUND", "NODATA"]);

// Translate raw DNS error codes into actionable user-facing messages.
function formatDnsError(code, type, domainName) {
  switch (code) {
    case "ENODATA":
    case "NODATA":
      return `No ${type} record found for ${domainName}. Add the ${type} record at your DNS provider, then verify again. DNS changes can take a few minutes to propagate.`;
    case "ENOTFOUND":
      return `Domain ${domainName} doesn't resolve. Make sure the domain is registered and pointed at a name server.`;
    case "ETIMEOUT":
    case "ETIMEDOUT":
      return `${type} lookup timed out. Try again in a moment.`;
    case "EAI_AGAIN":
      return `Temporary DNS resolver failure while checking ${type}. Try again in a moment.`;
    case "ESERVFAIL":
      return `DNS server returned SERVFAIL for ${type}. Your nameservers may be misconfigured.`;
    case "EREFUSED":
      return `DNS server refused the ${type} query. Check your nameserver configuration.`;
    default:
      return `${type} lookup failed: ${code || "unknown error"}`;
  }
}

// Run DNS verification on a Mongoose Domain document.
// Mutates and saves the document. Returns { results, statusChanged }.
export async function verifyDomainDns(domain) {
  const previousStatus = domain.verificationStatus;

  const results = {
    mxVerified: false,
    txtVerified: false,
    mxDetails: null,
    txtDetails: null,
    errors: [],
  };

  let mxLookupConclusive = true;
  let txtLookupConclusive = true;

  // ---- MX ----
  try {
    const mxRecords = await resolveMx(domain.name);
    const found = mxRecords.some(
      (r) =>
        r.exchange.toLowerCase() === MAIL_HOSTNAME.toLowerCase() ||
        r.exchange.toLowerCase() === `${MAIL_HOSTNAME.toLowerCase()}.`
    );
    results.mxVerified = found;
    results.mxDetails = mxRecords.map((r) => `${r.priority} ${r.exchange}`);
    if (!found) {
      results.errors.push(`MX record not found. Expected: ${MAIL_HOSTNAME}`);
    }
  } catch (err) {
    if (!CLEAN_NEGATIVE_CODES.has(err.code)) mxLookupConclusive = false;
    results.errors.push(formatDnsError(err.code, "MX", domain.name));
  }

  // ---- TXT ----
  try {
    const txtRecords = await resolveTxt(domain.name);
    const flatRecords = txtRecords.map((r) => r.join(""));
    const expectedTxt = `mailbox-verify=${domain.verificationToken}`;
    const found = flatRecords.some((r) => r === expectedTxt);
    results.txtVerified = found;
    results.txtDetails = flatRecords;
    if (!found) {
      results.errors.push(
        `TXT verification record not found. Expected: ${expectedTxt}`
      );
    }
  } catch (err) {
    if (!CLEAN_NEGATIVE_CODES.has(err.code)) txtLookupConclusive = false;
    results.errors.push(formatDnsError(err.code, "TXT", domain.name));
  }

  // ---- Persist ----
  if (results.mxVerified && results.txtVerified) {
    domain.dnsRecords.mxVerified = true;
    domain.dnsRecords.txtVerified = true;
    domain.verificationStatus = "verified";
    domain.verifiedAt = new Date();
  } else if (mxLookupConclusive && txtLookupConclusive) {
    // Conclusive negative — record actual state and mark failed
    domain.dnsRecords.mxVerified = results.mxVerified;
    domain.dnsRecords.txtVerified = results.txtVerified;
    domain.verificationStatus = "failed";
  }
  // else: transient DNS error — leave previous status untouched, just report errors

  await domain.save();

  return {
    results,
    statusChanged: previousStatus !== domain.verificationStatus,
    previousStatus,
    newStatus: domain.verificationStatus,
  };
}
