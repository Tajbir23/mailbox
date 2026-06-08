/**
 * OIDC Client Authentication Utility
 *
 * Provides functions for extracting and verifying OAuth client credentials
 * from token endpoint requests. Supports HTTP Basic auth and POST body params.
 *
 * Requirements: 5.2, 10.3, 10.4
 */

import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import OAuthClient from "@/lib/models/OAuthClient";

/**
 * Extract client credentials from an incoming request.
 *
 * Checks (in order):
 * 1. Authorization header with Basic scheme (base64-encoded client_id:client_secret)
 * 2. POST body parameters (client_id and client_secret)
 *
 * @param {Request} request - The incoming HTTP request object
 * @param {object} body - Parsed request body (form or JSON)
 * @returns {{ client_id: string, client_secret: string } | null}
 */
export function extractClientCredentials(request, body) {
  // 1. Check Authorization header for Basic auth
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("basic ")) {
    const encoded = authHeader.slice(6).trim();
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const colonIndex = decoded.indexOf(":");
      if (colonIndex > 0) {
        const client_id = decodeURIComponent(decoded.slice(0, colonIndex));
        const client_secret = decodeURIComponent(decoded.slice(colonIndex + 1));
        if (client_id && client_secret) {
          return { client_id, client_secret };
        }
      }
    } catch {
      // Invalid base64 or decoding — fall through to body check
    }
  }

  // 2. Check POST body parameters
  if (body && body.client_id && body.client_secret) {
    return {
      client_id: String(body.client_id),
      client_secret: String(body.client_secret),
    };
  }

  return null;
}

/**
 * Authenticate an OAuth client from request credentials.
 *
 * Full authentication flow:
 * 1. Extract credentials from Authorization header or body
 * 2. Look up client in OAuthClient model (include client_secret_hash)
 * 3. Verify client exists and is active
 * 4. Compare client_secret against stored bcrypt hash
 *
 * @param {Request} request - The incoming HTTP request object
 * @param {object} body - Parsed request body (form or JSON)
 * @returns {Promise<{authenticated: boolean, client?: object, error?: string, error_description?: string}>}
 */
export async function authenticateClient(request, body) {
  const credentials = extractClientCredentials(request, body);

  if (!credentials) {
    return {
      authenticated: false,
      error: "invalid_client",
      error_description: "Missing client credentials",
    };
  }

  const { client_id, client_secret } = credentials;

  await dbConnect();

  // Look up the client with the secret hash field included
  const client = await OAuthClient.findOne({ client_id }).select(
    "+client_secret_hash"
  );

  if (!client) {
    return {
      authenticated: false,
      error: "invalid_client",
      error_description: "Unknown client_id",
    };
  }

  if (!client.active) {
    return {
      authenticated: false,
      error: "invalid_client",
      error_description: "Client is not active",
    };
  }

  // Public clients don't have a secret hash — they authenticate via PKCE
  if (!client.client_secret_hash) {
    return {
      authenticated: false,
      error: "invalid_client",
      error_description: "Client does not support secret-based authentication",
    };
  }

  // Verify the secret against the stored bcrypt hash
  const isValid = await bcrypt.compare(client_secret, client.client_secret_hash);

  if (!isValid) {
    return {
      authenticated: false,
      error: "invalid_client",
      error_description: "Invalid client_secret",
    };
  }

  // Return client without the secret hash in the response object
  const clientObj = client.toObject();
  delete clientObj.client_secret_hash;

  return {
    authenticated: true,
    client: clientObj,
  };
}
