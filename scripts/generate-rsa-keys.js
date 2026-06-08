#!/usr/bin/env node

/**
 * Generate RSA Key Pair for OIDC Token Signing
 *
 * This script generates a 2048-bit RSA key pair and outputs the keys
 * as base64-encoded PEM strings ready to paste into .env.local.
 *
 * Usage: node scripts/generate-rsa-keys.js
 */

const crypto = require("crypto");

function generateRSAKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  // Base64 encode the PEM strings for safe storage in env vars
  const privateKeyBase64 = Buffer.from(privateKey).toString("base64");
  const publicKeyBase64 = Buffer.from(publicKey).toString("base64");

  console.log("=== OIDC RSA Key Pair Generated ===\n");
  console.log("Add the following to your .env.local file:\n");
  console.log(`OIDC_RSA_PRIVATE_KEY=${privateKeyBase64}\n`);
  console.log(`OIDC_RSA_PUBLIC_KEY=${publicKeyBase64}\n`);
  console.log("# Set this to your canonical issuer URL (primary domain)");
  console.log("OIDC_ISSUER_URL=https://your-domain.com\n");
  console.log("===================================");
}

generateRSAKeyPair();
