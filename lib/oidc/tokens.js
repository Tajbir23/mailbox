/**
 * OIDC Token Generation Utilities
 *
 * Provides functions to generate signed ID tokens (RS256),
 * opaque access/refresh tokens, and token hashing for secure storage.
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getPrivateKey, getKid, getIssuerUrl } from "@/lib/oidc/keys";

/**
 * Generate a signed ID token (JWT) with RS256 algorithm.
 *
 * @param {Object} params
 * @param {string} params.sub - User's MongoDB _id as string
 * @param {string} params.clientId - The client_id (audience)
 * @param {string[]} params.scopes - Granted scopes array
 * @param {string|null} params.nonce - Nonce from authorization request (if provided)
 * @param {Object} params.user - User object with email and name fields
 * @returns {string} Signed JWT ID token
 */
export function generateIdToken({ sub, clientId, scopes, nonce, user }) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: getIssuerUrl(),
    sub,
    aud: clientId,
    exp: now + 3600,
    iat: now,
  };

  // Include nonce if provided in the authorization request
  if (nonce) {
    payload.nonce = nonce;
  }

  // Scope-dependent claims
  if (scopes.includes("email")) {
    payload.email = user.email;
    payload.email_verified = true;
  }

  if (scopes.includes("profile")) {
    payload.name = user.name;
  }

  // Export the private KeyObject to PEM for jsonwebtoken compatibility
  const privateKeyPem = getPrivateKey().export({ type: "pkcs8", format: "pem" });

  return jwt.sign(payload, privateKeyPem, {
    algorithm: "RS256",
    keyid: getKid(),
  });
}

/**
 * Generate a cryptographically random opaque access token.
 * @returns {string} 64-byte hex string (128 characters)
 */
export function generateAccessToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Generate a cryptographically random opaque refresh token.
 * @returns {string} 64-byte hex string (128 characters)
 */
export function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Hash a token using SHA-256 for secure storage in the database.
 * @param {string} token - The raw token string
 * @returns {string} SHA-256 hex hash of the token
 */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
