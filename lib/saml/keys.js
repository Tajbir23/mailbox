/**
 * SAML Signing Certificate / Key Management
 *
 * Loads the X.509 signing certificate and its RSA private key from environment
 * variables (base64-encoded PEM), and derives the host-based IdP URLs used for
 * metadata, the entityID, and the SSO endpoint.
 *
 * These variables are DISTINCT from the OIDC RSA key variables so the two
 * providers never share key material.
 *
 * Environment variables:
 *   SAML_SIGNING_CERT - Base64-encoded X.509 certificate in PEM format
 *   SAML_SIGNING_KEY  - Base64-encoded RSA private key in PEM format
 *   OIDC_ISSUER_URL   - Fallback origin when no host header is present (reused, read-only)
 */

let _certPem = null;
let _privateKeyPem = null;
let _certDerBase64 = null;

/**
 * Decode a base64-encoded PEM string.
 * @param {string} base64Value
 * @returns {string|null}
 */
function decodePEM(base64Value) {
  if (!base64Value) return null;
  return Buffer.from(base64Value, "base64").toString("utf-8");
}

/**
 * Load the SAML signing certificate and private key from environment.
 *
 * Reads `SAML_SIGNING_CERT` and `SAML_SIGNING_KEY` (base64-encoded PEM),
 * decodes them to PEM strings, and caches the results in module scope.
 *
 * @returns {{ certPem: string, privateKeyPem: string }}
 * @throws {Error} when a required environment variable is missing or empty
 */
function loadSigningCert() {
  if (!_certPem || !_privateKeyPem) {
    const certPem = decodePEM(process.env.SAML_SIGNING_CERT);
    if (!certPem) {
      throw new Error("SAML_SIGNING_CERT environment variable is not set");
    }
    const privateKeyPem = decodePEM(process.env.SAML_SIGNING_KEY);
    if (!privateKeyPem) {
      throw new Error("SAML_SIGNING_KEY environment variable is not set");
    }
    _certPem = certPem;
    _privateKeyPem = privateKeyPem;
  }
  return { certPem: _certPem, privateKeyPem: _privateKeyPem };
}

/**
 * Get the RSA private key PEM string (for the xml-crypto signer).
 * @returns {string}
 * @throws {Error} when the signing key environment variable is missing
 */
function getPrivateKey() {
  return loadSigningCert().privateKeyPem;
}

/**
 * Get the single-line base64 DER body of the signing certificate.
 *
 * Strips the PEM header/footer lines and all whitespace/newlines, returning
 * the remaining base64 string. This is the value embedded in `<X509Certificate>`
 * inside signatures and in the metadata `KeyDescriptor`.
 *
 * @returns {string}
 * @throws {Error} when the signing certificate environment variable is missing
 */
function getCertDerBase64() {
  if (!_certDerBase64) {
    const { certPem } = loadSigningCert();
    _certDerBase64 = certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s+/g, "");
  }
  return _certDerBase64;
}

/**
 * Derive the SAML IdP origin from the incoming request's host headers.
 *
 * Mirrors `getIssuerFromHeaders` in `lib/oidc/keys.js` so each white-label
 * domain acts as its own independent SAML IdP. Falls back to OIDC_ISSUER_URL
 * when no host header is present.
 *
 * @param {Headers} headers - The incoming request headers
 * @returns {string} Origin (e.g. "https://securegptpoint.store")
 */
function getEntityIdFromHeaders(headers) {
  const host =
    (headers.get && (headers.get("x-forwarded-host") || headers.get("host"))) || null;

  if (!host) {
    // No host available — fall back to the configured issuer (or empty).
    return process.env.OIDC_ISSUER_URL
      ? process.env.OIDC_ISSUER_URL.replace(/\/+$/, "")
      : "";
  }

  const proto =
    (headers.get && headers.get("x-forwarded-proto")) ||
    (process.env.NODE_ENV === "production" ? "https" : "http");

  return `${proto}://${host}`.replace(/\/+$/, "");
}

/**
 * Derive the full set of host-based SAML IdP URLs from request headers.
 *
 * @param {Headers} headers - The incoming request headers
 * @returns {{ origin: string, entityId: string, ssoUrl: string, metadataUrl: string }}
 */
function samlUrls(headers) {
  const origin = getEntityIdFromHeaders(headers);
  return {
    origin,
    entityId: `${origin}/api/saml/metadata`,
    ssoUrl: `${origin}/api/saml/sso`,
    metadataUrl: `${origin}/api/saml/metadata`,
  };
}

module.exports = {
  loadSigningCert,
  getPrivateKey,
  getCertDerBase64,
  getEntityIdFromHeaders,
  samlUrls,
};
