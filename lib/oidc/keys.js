/**
 * OIDC RSA Key Management
 *
 * Loads RSA keys from environment variables (base64-encoded PEM),
 * and provides key objects for signing/verification plus JWKS export.
 *
 * Environment variables:
 *   OIDC_RSA_PRIVATE_KEY - Base64-encoded RSA private key in PEM format
 *   OIDC_RSA_PUBLIC_KEY  - Base64-encoded RSA public key in PEM format
 *   OIDC_ISSUER_URL      - Canonical issuer URL for the OIDC provider
 */

const crypto = require("crypto");

let _privateKey = null;
let _publicKey = null;
let _kid = null;

/**
 * Decode a base64-encoded PEM string from an environment variable.
 */
function decodePEM(base64Value) {
  if (!base64Value) return null;
  return Buffer.from(base64Value, "base64").toString("utf-8");
}

/**
 * Get the RSA private key as a KeyObject for signing.
 * @returns {crypto.KeyObject}
 */
function getPrivateKey() {
  if (!_privateKey) {
    const pem = decodePEM(process.env.OIDC_RSA_PRIVATE_KEY);
    if (!pem) {
      throw new Error("OIDC_RSA_PRIVATE_KEY environment variable is not set");
    }
    _privateKey = crypto.createPrivateKey(pem);
  }
  return _privateKey;
}

/**
 * Get the RSA public key as a KeyObject for verification.
 * @returns {crypto.KeyObject}
 */
function getPublicKey() {
  if (!_publicKey) {
    const pem = decodePEM(process.env.OIDC_RSA_PUBLIC_KEY);
    if (!pem) {
      throw new Error("OIDC_RSA_PUBLIC_KEY environment variable is not set");
    }
    _publicKey = crypto.createPublicKey(pem);
  }
  return _publicKey;
}

/**
 * Generate a stable key ID (kid) based on the public key thumbprint.
 * Uses SHA-256 hash of the JWK representation, truncated to 8 hex chars.
 * @returns {string}
 */
function getKid() {
  if (!_kid) {
    const pubKey = getPublicKey();
    const jwk = pubKey.export({ format: "jwk" });
    // Create a thumbprint from the key components (n and e)
    const thumbprintInput = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
    _kid = crypto.createHash("sha256").update(thumbprintInput).digest("hex").slice(0, 16);
  }
  return _kid;
}

/**
 * Get the public key in JSON Web Key Set (JWKS) format.
 * Returns an object with a "keys" array containing the public RSA key
 * with kid, kty, n, e, alg, and use fields.
 *
 * @returns {{ keys: Array<{kid: string, kty: string, n: string, e: string, alg: string, use: string}> }}
 */
function getJWKS() {
  const pubKey = getPublicKey();
  const jwk = pubKey.export({ format: "jwk" });

  return {
    keys: [
      {
        kid: getKid(),
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
        alg: "RS256",
        use: "sig",
      },
    ],
  };
}

/**
 * Get the OIDC issuer URL from environment.
 * @returns {string}
 */
function getIssuerUrl() {
  const issuer = process.env.OIDC_ISSUER_URL;
  if (!issuer) {
    throw new Error("OIDC_ISSUER_URL environment variable is not set");
  }
  // Remove trailing slash for consistency
  return issuer.replace(/\/+$/, "");
}

module.exports = {
  getPrivateKey,
  getPublicKey,
  getKid,
  getJWKS,
  getIssuerUrl,
};
