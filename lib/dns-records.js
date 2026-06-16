/**
 * Shared DNS-record builder for the per-domain setup guide.
 *
 * Given a Domain document, produces the COMPLETE set of DNS records a user must
 * add at their registrar to fully use the domain on this platform — grouped by
 * purpose with plain-language "where / why" instructions:
 *
 *   1. Ownership verification (required)  — MX + TXT token
 *   2. Email sending / deliverability     — SPF + DKIM + DMARC
 *   3. Website hosting (optional)         — A records
 *   + PTR (reverse DNS) guidance
 *
 * The same DKIM public-key derivation is used by the VPS setup script, so what
 * the UI shows matches what the server signs with.
 *
 * All inputs are read from env with optional overrides so this stays unit/
 * property testable.
 */

import crypto from "crypto";

/** Resolve a DKIM private key that may be raw PEM or base64-encoded PEM. */
export function resolveDkimPrivateKey(raw) {
  if (!raw) return "";
  const val = String(raw).trim();
  if (val.includes("BEGIN") && val.includes("PRIVATE KEY")) return val;
  try {
    const decoded = Buffer.from(val, "base64").toString("utf8");
    if (decoded.includes("BEGIN") && decoded.includes("PRIVATE KEY")) return decoded;
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Derive the public DKIM TXT value (`p=…`, single-line base64 of the SPKI DER)
 * from the DKIM private key. Returns "" when no/invalid key is provided.
 */
export function dkimPublicKeyValue(rawPrivateKey) {
  const pem = resolveDkimPrivateKey(rawPrivateKey);
  if (!pem) return "";
  try {
    const spki = crypto
      .createPublicKey(pem)
      .export({ type: "spki", format: "pem" })
      .toString();
    return spki
      .split("\n")
      .filter((l) => l && !l.startsWith("-----"))
      .join("");
  } catch {
    return "";
  }
}

/**
 * Build the grouped DNS records + instructions for a domain.
 *
 * @param {object} domain  Mongoose Domain doc/lean object (name, verificationToken,
 *                         verificationStatus, websiteStatus, dnsRecords).
 * @param {object} [opts]  Overrides (else read from env):
 *   - mailHostname  MX target / mail server hostname (MAIL_SERVER_HOSTNAME)
 *   - serverIp      public IP for A records + SPF (HOSTING_SERVER_IP / SERVER_PUBLIC_IP)
 *   - dkimSelector  DKIM selector (DKIM_SELECTOR, default "mail")
 *   - dkimPrivateKey DKIM private key (DKIM_PRIVATE_KEY)
 */
export function buildDomainDnsRecords(domain, opts = {}) {
  const name = domain?.name || "";
  const token = domain?.verificationToken || "";

  const mailHostname =
    opts.mailHostname || process.env.MAIL_SERVER_HOSTNAME || "mail.yourdomain.com";
  const serverIp =
    opts.serverIp ||
    process.env.HOSTING_SERVER_IP ||
    process.env.SERVER_PUBLIC_IP ||
    "";
  const dkimSelector = opts.dkimSelector || process.env.DKIM_SELECTOR || "mail";
  const dkimValue = dkimPublicKeyValue(
    opts.dkimPrivateKey || process.env.DKIM_PRIVATE_KEY
  );

  const approved = domain?.websiteStatus === "approved";

  // ── Group 1: ownership verification (required) ──
  const verifyRecords = [
    {
      type: "MX",
      host: "@",
      fqdn: name,
      value: mailHostname,
      priority: 10,
      ttl: 3600,
      purpose: "Routes incoming email for your domain to our mail server.",
      verified: Boolean(domain?.dnsRecords?.mxVerified),
    },
    {
      type: "TXT",
      host: "@",
      fqdn: name,
      value: `mailbox-verify=${token}`,
      ttl: 3600,
      purpose: "Proves you own this domain so we can verify it.",
      verified: Boolean(domain?.dnsRecords?.txtVerified),
    },
  ];

  // ── Group 2: email sending / deliverability ──
  const sendingRecords = [
    {
      type: "TXT",
      host: "@",
      fqdn: name,
      value: serverIp ? `v=spf1 a mx ip4:${serverIp} ~all` : "v=spf1 a mx ~all",
      ttl: 3600,
      purpose:
        "SPF — authorizes this server to send mail for your domain (reduces spam rejection).",
    },
    {
      type: "TXT",
      host: "_dmarc",
      fqdn: `_dmarc.${name}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${name}`,
      ttl: 3600,
      purpose:
        "DMARC — tells receivers how to handle unauthenticated mail and where to send reports.",
    },
  ];
  if (dkimValue) {
    sendingRecords.push({
      type: "TXT",
      host: `${dkimSelector}._domainkey`,
      fqdn: `${dkimSelector}._domainkey.${name}`,
      value: `v=DKIM1; k=rsa; p=${dkimValue}`,
      ttl: 3600,
      purpose:
        "DKIM — cryptographically signs your outgoing mail so Gmail/Outlook trust it.",
    });
  }

  // ── Group 3: website hosting (optional) ──
  const hostingRecords = serverIp
    ? [
        {
          type: "A",
          host: "@",
          fqdn: name,
          value: serverIp,
          ttl: 3600,
          purpose: "Points your root domain to our web server (for website hosting).",
        },
        {
          type: "A",
          host: "www",
          fqdn: `www.${name}`,
          value: serverIp,
          ttl: 3600,
          purpose: "Points the www subdomain to our web server.",
        },
      ]
    : [];

  const groups = [
    {
      id: "verify",
      title: "Step 1 — Verify ownership (required)",
      required: true,
      where:
        "Add these at your domain registrar / DNS provider (Namecheap, GoDaddy, Cloudflare, …) under DNS settings for this domain. Use \"@\" for the host/name to mean the root domain.",
      records: verifyRecords,
    },
    {
      id: "sending",
      title: "Step 2 — Email sending & deliverability (recommended)",
      required: false,
      where:
        "Add these TXT records so mail you send from this domain reaches the inbox instead of spam. Add them as separate TXT records at the listed host.",
      records: sendingRecords,
    },
    {
      id: "hosting",
      title: "Step 3 — Website hosting (optional)",
      required: false,
      where:
        "Only needed if you want your website served from this domain. Remove any existing A records on @ and www first to avoid conflicts.",
      records: hostingRecords,
    },
  ].filter((g) => g.records.length > 0);

  return {
    domain: name,
    approved,
    verificationStatus: domain?.verificationStatus || "pending",
    websiteStatus: domain?.websiteStatus || "none",
    serverIp,
    mailHostname,
    dkimConfigured: Boolean(dkimValue),
    groups,
    ptr: {
      title: "Reverse DNS (PTR) — ask your VPS host",
      note: serverIp
        ? `For best deliverability, ask your VPS provider to set reverse DNS (PTR) for ${serverIp} to ${mailHostname}. This is configured at the hosting provider, not at your registrar.`
        : `For best deliverability, set reverse DNS (PTR) for your server's IP to ${mailHostname} at your VPS provider.`,
    },
  };
}
