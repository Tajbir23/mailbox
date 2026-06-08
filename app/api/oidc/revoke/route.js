/**
 * OIDC Token Revocation Endpoint - /api/oidc/revoke
 *
 * Handles token revocation requests per RFC 7009.
 * Supports revoking access tokens and refresh tokens with cascade
 * revocation of child access tokens when a refresh token is revoked.
 *
 * Security: Always returns HTTP 200 regardless of token validity to prevent
 * token existence probing (except for client authentication failures → 401).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { authenticateClient } from "@/lib/oidc/client-auth";
import { hashToken } from "@/lib/oidc/tokens";
import OIDCToken from "@/lib/models/OIDCToken";

export const dynamic = "force-dynamic";

/**
 * Parse the request body from either application/x-www-form-urlencoded or application/json.
 * @param {Request} request
 * @returns {Promise<object>}
 */
async function parseBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const body = {};
    for (const [key, value] of params.entries()) {
      body[key] = value;
    }
    return body;
  }

  // Default to JSON parsing
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Revoke a refresh token and all access tokens issued from it.
 * @param {string} tokenHash - SHA-256 hash of the refresh token
 */
async function revokeRefreshToken(tokenHash) {
  // Mark the refresh token as revoked
  await OIDCToken.updateOne(
    { token_hash: tokenHash, token_type: "refresh_token" },
    { $set: { revoked: true } }
  );

  // Cascade: revoke all access tokens issued from this refresh token
  await OIDCToken.updateMany(
    { parent_refresh_token: tokenHash, token_type: "access_token" },
    { $set: { revoked: true } }
  );
}

/**
 * Revoke an access token.
 * @param {string} tokenHash - SHA-256 hash of the access token
 */
async function revokeAccessToken(tokenHash) {
  await OIDCToken.updateOne(
    { token_hash: tokenHash, token_type: "access_token" },
    { $set: { revoked: true } }
  );
}

/**
 * POST /api/oidc/revoke
 *
 * Token revocation endpoint. Requires client authentication.
 * Accepts token and token_type_hint parameters.
 * Always returns HTTP 200 (except for client auth failures).
 */
export async function POST(request) {
  try {
    const body = await parseBody(request);

    // Step 1: Authenticate the client (required per spec)
    const authResult = await authenticateClient(request, body);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: authResult.error, error_description: authResult.error_description },
        { status: 401 }
      );
    }

    // Step 2: Extract token and token_type_hint
    const { token, token_type_hint } = body;

    // If no token provided, return 200 (nothing to revoke, prevent probing)
    if (!token) {
      return NextResponse.json({}, { status: 200 });
    }

    // Step 3: Hash the token for lookup
    const tokenHash = hashToken(token);

    await dbConnect();

    // Step 4: Revoke based on token_type_hint
    if (token_type_hint === "refresh_token") {
      await revokeRefreshToken(tokenHash);
    } else if (token_type_hint === "access_token") {
      await revokeAccessToken(tokenHash);
    } else {
      // No hint or unrecognized hint: try both types
      await revokeRefreshToken(tokenHash);
      await revokeAccessToken(tokenHash);
    }

    // Step 5: Always return 200 OK with empty body (prevents token probing)
    return NextResponse.json({}, { status: 200 });
  } catch (error) {
    console.error("Revocation endpoint error:", error);
    // Even on server errors, return 200 to prevent information leakage
    // (though in practice a 500 might be acceptable for true server failures)
    return NextResponse.json({}, { status: 200 });
  }
}
