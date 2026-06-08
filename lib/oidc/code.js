/**
 * Authorization Code Utilities
 *
 * Generates cryptographically random authorization codes and stores them
 * in the AuthorizationCode model with 60-second expiry.
 * Also provides code lookup and single-use enforcement for token exchange.
 *
 * Requirements: 3.5, 3.7, 4.1, 5.1, 5.8, 5.10
 */

import crypto from "crypto";
import dbConnect from "@/lib/mongodb";
import AuthorizationCode from "@/lib/models/AuthorizationCode";

/**
 * Generate a cryptographically random authorization code, store it in the database,
 * and return the code string.
 *
 * @param {object} params
 * @param {string} params.client_id - The client identifier
 * @param {string} params.user_id - The user's MongoDB _id
 * @param {string} params.redirect_uri - The redirect URI bound to this code
 * @param {string[]} params.scopes - Granted scopes
 * @param {string} [params.state] - OAuth state parameter
 * @param {string} [params.nonce] - OIDC nonce parameter
 * @param {string} [params.code_challenge] - PKCE code challenge
 * @param {string} [params.code_challenge_method] - PKCE challenge method
 * @returns {Promise<string>} The generated authorization code
 */
export async function generateAuthorizationCode({
  client_id,
  user_id,
  redirect_uri,
  scopes,
  state,
  nonce,
  code_challenge,
  code_challenge_method,
}) {
  await dbConnect();

  const code = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds

  await AuthorizationCode.create({
    code,
    client_id,
    user_id,
    redirect_uri,
    scopes,
    state: state || undefined,
    nonce: nonce || undefined,
    code_challenge: code_challenge || undefined,
    code_challenge_method: code_challenge_method || undefined,
    expiresAt,
  });

  return code;
}


/**
 * Find an authorization code and atomically mark it as used (single-use enforcement).
 *
 * Returns the code record if found and successfully marked as used.
 * Returns an error object if the code is invalid, expired, or already used.
 *
 * @param {string} code - The authorization code string
 * @returns {Promise<{success: boolean, codeRecord?: object, error?: string, error_description?: string}>}
 */
export async function findAndUseCode(code) {
  if (!code) {
    return {
      success: false,
      error: "invalid_grant",
      error_description: "Authorization code is required",
    };
  }

  await dbConnect();

  // Atomically find the code and mark it as used to prevent replay attacks
  const codeRecord = await AuthorizationCode.findOneAndUpdate(
    { code, used: false },
    { $set: { used: true } },
    { new: true }
  );

  if (!codeRecord) {
    // Check if the code exists but was already used
    const existingCode = await AuthorizationCode.findOne({ code });
    if (existingCode && existingCode.used) {
      return {
        success: false,
        error: "invalid_grant",
        error_description: "Authorization code has already been used",
      };
    }

    return {
      success: false,
      error: "invalid_grant",
      error_description: "Invalid authorization code",
    };
  }

  // Check if code has expired
  if (codeRecord.expiresAt < new Date()) {
    return {
      success: false,
      error: "invalid_grant",
      error_description: "Authorization code has expired",
    };
  }

  return {
    success: true,
    codeRecord,
  };
}
