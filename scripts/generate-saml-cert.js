#!/usr/bin/env node

/**
 * Generate Self-Signed X.509 Signing Certificate for the SAML 2.0 Identity Provider
 *
 * This script generates a 2048-bit RSA key pair and a matching self-signed
 * X.509 certificate (PEM), then outputs both as base64-encoded PEM strings
 * ready to paste into .env.local as SAML_SIGNING_CERT and SAML_SIGNING_KEY.
 *
 * It uses only Node's built-in `crypto` module plus a minimal ASN.1/DER
 * certificate builder, so it requires no extra runtime dependency and runs
 * cross-platform (Windows dev + Linux VPS) without shelling out to openssl.
 *
 * Usage: node scripts/generate-saml-cert.js
 */

const crypto = require("crypto");

// --- Minimal ASN.1 / DER encoding helpers -------------------------------

function encodeLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

// Tag-Length-Value
function tlv(tag, value) {
  return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value]);
}

function encodeSequence(...parts) {
  return tlv(0x30, Buffer.concat(parts));
}

function encodeSet(...parts) {
  return tlv(0x31, Buffer.concat(parts));
}

// INTEGER from a big-endian byte buffer (kept positive)
function encodeIntegerBytes(buf) {
  let b = buf;
  let i = 0;
  while (i < b.length - 1 && b[i] === 0x00) i++;
  b = b.subarray(i);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return tlv(0x02, b);
}

function encodeSmallInteger(value) {
  return tlv(0x02, Buffer.from([value]));
}

function encodeOID(oid) {
  const parts = oid.split(".").map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const stack = [v & 0x7f];
    v = Math.floor(v / 128);
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function encodeNull() {
  return Buffer.from([0x05, 0x00]);
}

function encodeUTF8String(str) {
  return tlv(0x0c, Buffer.from(str, "utf8"));
}

function encodeUTCTime(date) {
  const iso = date.toISOString();
  const s =
    iso.slice(2, 4) +
    iso.slice(5, 7) +
    iso.slice(8, 10) +
    iso.slice(11, 13) +
    iso.slice(14, 16) +
    iso.slice(17, 19) +
    "Z";
  return tlv(0x17, Buffer.from(s, "ascii"));
}

// AlgorithmIdentifier for sha256WithRSAEncryption (1.2.840.113549.1.1.11)
function algIdSha256RSA() {
  return encodeSequence(encodeOID("1.2.840.113549.1.1.11"), encodeNull());
}

// Name with a single commonName (OID 2.5.4.3) RDN
function encodeName(commonName) {
  const attributeTypeAndValue = encodeSequence(
    encodeOID("2.5.4.3"),
    encodeUTF8String(commonName)
  );
  return encodeSequence(encodeSet(attributeTypeAndValue));
}

// --- Certificate construction -------------------------------------------

function buildSelfSignedCert({ commonName, days }) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  // SubjectPublicKeyInfo straight from the key object (already valid DER).
  const spkiDer = publicKey.export({ type: "spki", format: "der" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + days * 24 * 60 * 60 * 1000);

  const version = tlv(0xa0, encodeSmallInteger(2)); // [0] EXPLICIT v3
  const serialNumber = encodeIntegerBytes(crypto.randomBytes(16));
  const name = encodeName(commonName);
  const validity = encodeSequence(
    encodeUTCTime(notBefore),
    encodeUTCTime(notAfter)
  );

  const tbsCertificate = encodeSequence(
    version,
    serialNumber,
    algIdSha256RSA(), // signature
    name, // issuer (self-signed => issuer == subject)
    validity,
    name, // subject
    spkiDer // subjectPublicKeyInfo
  );

  // Sign the TBSCertificate with RSA-SHA256 (PKCS#1 v1.5).
  const signature = crypto.sign("sha256", tbsCertificate, privateKey);
  const signatureBitString = tlv(
    0x03,
    Buffer.concat([Buffer.from([0x00]), signature])
  );

  const certDer = encodeSequence(
    tbsCertificate,
    algIdSha256RSA(),
    signatureBitString
  );

  const certPem = toPem(certDer, "CERTIFICATE");

  return { certPem, privateKeyPem, publicKey };
}

function toPem(der, label) {
  const b64 = der.toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

// --- Main ----------------------------------------------------------------

function generateSamlCert() {
  const { certPem, privateKeyPem, publicKey } = buildSelfSignedCert({
    commonName: "Mailbox SAML IdP",
    days: 3650,
  });

  // Self-test: the generated PEM must parse and the self-signature verify.
  const x509 = new crypto.X509Certificate(certPem);
  if (!x509.verify(publicKey)) {
    throw new Error("Generated certificate failed self-signature verification");
  }

  const certBase64 = Buffer.from(certPem).toString("base64");
  const keyBase64 = Buffer.from(privateKeyPem).toString("base64");

  console.log("=== SAML Signing Certificate Generated ===\n");
  console.log("Add the following to your .env.local file:\n");
  console.log(`SAML_SIGNING_CERT=${certBase64}\n`);
  console.log(`SAML_SIGNING_KEY=${keyBase64}\n`);
  console.log("# Both values are base64-encoded PEM (certificate + RSA private key).");
  console.log("# These are distinct from the OIDC_RSA_* keys; do not reuse them.");
  console.log("==========================================");
}

generateSamlCert();
