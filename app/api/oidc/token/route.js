/**
 * OIDC Token Endpoint - /api/oidc/token
 *
 * Handles token exchange for authorization_code and refresh_token grant types.
 * Implements OAuth 2.0 / OIDC token issuance with support for:
 * - Confidential client authentication (client_secret via Basic auth or POST body)
 * - Public client authentication (PKCE code_verifier)
 * - Access token generation with 3600s lifetime
 * - Refresh token generation for confidential clients with offline_access scope (30-day lifetime)
 * - Refresh token rotation with reuse detection (revoke all on reuse)
 * - ID token generation with RS256 signing
 * - Rate limiting: 20 requests per minute per client_id
 * - CORS: allows cross-origin requests (token endpoint requires client auth)
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 4.3, 4.4, 8.1, 10.1, 10.2, 10.5, 10.6
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { findAndUseCode } from "@/lib/oidc/code";
import { authenticateClient } from "@/lib/oidc/client-auth";
import {
  generateIdToken,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "@/lib/oidc/tokens";
import { checkRateLimit } from "@/lib/oidc/rate-limit";
import { getIssuerFromHeaders } from "@/lib/oidc/keys";
import OAuthClient from "@/lib/models/OAuthClient";
import OIDCToken from "@/lib/models/OIDCToken";
import User from "@/lib/models/User";

export const dynamic = "force-dynamic";

/**
 * CORS headers for the token endpoint.
 * Uses permissive Access-Control-Allow-Origin: * since the token endpoint
 * requires client authentication (same approach as Google/Microsoft OIDC).
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Create an OAuth 2.0 error response with proper headers.
 * @param {string} error - OAuth error code
 * @param {string} errorDescription - Human-readable error description
 * @param {number} status - HTTP status code
 * @returns {NextResponse}
 */
function errorResponse(error, errorDescription, status = 400) {
  return NextResponse.json(
    { error, error_description: errorDescription },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...corsHeaders,
      },
    }
  );
}

/**
 * OPTIONS /api/oidc/token
 *
 * CORS preflight handler for the token endpoint.
 * Requirements: 10.2
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

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
 * Handle the authorization_code grant type.
 * @param {Request} request - The incoming request
 * @param {object} body - Parsed request body
 * @returns {Promise<NextResponse>}
 */
async function handleAuthorizationCodeGrant(request, body) {
  const { code, redirect_uri, code_verifier } = body;

  // Step 1: Find and use the authorization code (single-use enforcement)
  const codeResult = await findAndUseCode(code);
  if (!codeResult.success) {
    return errorResponse(codeResult.error, codeResult.error_description);
  }

  const codeRecord = codeResult.codeRecord;

  // Step 2: Look up the OAuth client to determine client_type
  await dbConnect();
  const client = await OAuthClient.findOne({ client_id: codeRecord.client_id });

  if (!client || !client.active) {
    return errorResponse("invalid_client", "Client not found or inactive", 401);
  }

  // Step 3: Authenticate based on client type
  if (client.client_type === "confidential") {
    // Confidential clients must authenticate with client_secret
    const authResult = await authenticateClient(request, body);
    if (!authResult.authenticated) {
      return errorResponse(
        authResult.error,
        authResult.error_description,
        401
      );
    }

    // Ensure authenticated client matches the code's client_id
    if (authResult.client.client_id !== codeRecord.client_id) {
      return errorResponse(
        "invalid_grant",
        "Client ID mismatch",
        400
      );
    }
  } else {
    // Public clients must authenticate via PKCE code_verifier
    if (!code_verifier) {
      return errorResponse(
        "invalid_grant",
        "code_verifier is required for public clients"
      );
    }

    if (!codeRecord.code_challenge) {
      return errorResponse(
        "invalid_grant",
        "No code_challenge associated with this authorization code"
      );
    }

    // Verify PKCE: BASE64URL(SHA256(code_verifier)) must match stored code_challenge
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(code_verifier)
      .digest("base64url");

    if (expectedChallenge !== codeRecord.code_challenge) {
      return errorResponse(
        "invalid_grant",
        "code_verifier verification failed"
      );
    }
  }

  // Step 4: Verify redirect_uri matches the one bound to the authorization code
  if (redirect_uri !== codeRecord.redirect_uri) {
    return errorResponse(
      "invalid_grant",
      "redirect_uri does not match the authorization request"
    );
  }

  // Step 5: Fetch user from DB for ID token claims
  const user = await User.findById(codeRecord.user_id);
  if (!user) {
    return errorResponse("invalid_grant", "User not found");
  }

  // Step 6: Generate ID token
  const idToken = generateIdToken({
    sub: user._id.toString(),
    clientId: codeRecord.client_id,
    scopes: codeRecord.scopes,
    nonce: codeRecord.nonce || null,
    user: { email: user.email, name: user.name },
    issuer: getIssuerFromHeaders(request.headers),
  });

  // Step 7: Generate access token and store its hash
  const accessToken = generateAccessToken();
  const accessTokenHash = hashToken(accessToken);

  await OIDCToken.create({
    token_hash: accessTokenHash,
    token_type: "access_token",
    client_id: codeRecord.client_id,
    user_id: user._id,
    scopes: codeRecord.scopes,
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
  });

  // Step 8: Build response
  const responseBody = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    id_token: idToken,
  };

  // Step 9: Generate refresh token for confidential clients with offline_access scope
  if (
    client.client_type === "confidential" &&
    codeRecord.scopes.includes("offline_access")
  ) {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);

    await OIDCToken.create({
      token_hash: refreshTokenHash,
      token_type: "refresh_token",
      client_id: codeRecord.client_id,
      user_id: user._id,
      scopes: codeRecord.scopes,
      expiresAt: new Date(Date.now() + 2592000 * 1000), // 30 days
    });

    responseBody.refresh_token = refreshToken;
  }

  return NextResponse.json(responseBody, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...corsHeaders,
    },
  });
}

/**
 * Handle the refresh_token grant type.
 *
 * Implements refresh token rotation with reuse detection:
 * - Validates the refresh token exists, is not revoked, not expired, and matches client_id
 * - Issues a new access token and rotates the refresh token (invalidates old, issues new)
 * - If a previously revoked refresh token is presented, revokes ALL tokens for that
 *   client-user pair as a security precaution against token theft.
 *
 * Requirements: 5.7, 10.5, 10.6
 *
 * @param {Request} request - The incoming request
 * @param {object} body - Parsed request body
 * @returns {Promise<NextResponse>}
 */
async function handleRefreshTokenGrant(request, body) {
  // Step 1: Authenticate the client (only confidential clients have refresh tokens)
  const authResult = await authenticateClient(request, body);
  if (!authResult.authenticated) {
    return errorResponse(authResult.error, authResult.error_description, 401);
  }

  const clientRecord = authResult.client;

  // Step 2: Extract and validate refresh_token parameter
  const { refresh_token } = body;
  if (!refresh_token) {
    return errorResponse(
      "invalid_request",
      "refresh_token parameter is required"
    );
  }

  // Step 3: Hash the refresh token for database lookup
  const refreshTokenHash = hashToken(refresh_token);

  await dbConnect();

  // Step 4: Look up the token record
  const tokenRecord = await OIDCToken.findOne({
    token_hash: refreshTokenHash,
    token_type: "refresh_token",
  });

  // Step 5: If not found, check if there's a revoked record (reuse detection)
  if (!tokenRecord) {
    // Check if this was a previously revoked token (reuse detection)
    const revokedRecord = await OIDCToken.findOne({
      token_hash: refreshTokenHash,
      token_type: "refresh_token",
      revoked: true,
    });

    if (revokedRecord) {
      // Security: A revoked refresh token was reused — revoke ALL tokens for this client-user pair
      await OIDCToken.updateMany(
        { client_id: revokedRecord.client_id, user_id: revokedRecord.user_id },
        { $set: { revoked: true } }
      );
    }

    return errorResponse("invalid_grant", "Invalid refresh token");
  }

  // Step 6: If found but revoked → revoke all tokens for the client-user pair (reuse detection)
  if (tokenRecord.revoked) {
    await OIDCToken.updateMany(
      { client_id: tokenRecord.client_id, user_id: tokenRecord.user_id },
      { $set: { revoked: true } }
    );
    return errorResponse("invalid_grant", "Refresh token has been revoked");
  }

  // Step 7: If found but expired → return invalid_grant
  if (tokenRecord.expiresAt < new Date()) {
    return errorResponse("invalid_grant", "Refresh token has expired");
  }

  // Step 8: Validate client_id matches
  if (tokenRecord.client_id !== clientRecord.client_id) {
    return errorResponse("invalid_grant", "Client ID mismatch");
  }

  // Step 9: Mark old refresh token as revoked (rotation)
  tokenRecord.revoked = true;
  await tokenRecord.save();

  // Step 10: Fetch user for ID token claims
  const user = await User.findById(tokenRecord.user_id);
  if (!user) {
    return errorResponse("invalid_grant", "User not found");
  }

  // Step 11: Generate new access token and store hash
  const newAccessToken = generateAccessToken();
  const newAccessTokenHash = hashToken(newAccessToken);

  await OIDCToken.create({
    token_hash: newAccessTokenHash,
    token_type: "access_token",
    client_id: tokenRecord.client_id,
    user_id: tokenRecord.user_id,
    scopes: tokenRecord.scopes,
    parent_refresh_token: refreshTokenHash,
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
  });

  // Step 12: Generate new refresh token and store hash (rotation)
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);

  await OIDCToken.create({
    token_hash: newRefreshTokenHash,
    token_type: "refresh_token",
    client_id: tokenRecord.client_id,
    user_id: tokenRecord.user_id,
    scopes: tokenRecord.scopes,
    expiresAt: new Date(Date.now() + 2592000 * 1000), // 30 days
  });

  // Step 13: Generate new ID token
  const idToken = generateIdToken({
    sub: user._id.toString(),
    clientId: tokenRecord.client_id,
    scopes: tokenRecord.scopes,
    nonce: null,
    user: { email: user.email, name: user.name },
    issuer: getIssuerFromHeaders(request.headers),
  });

  // Step 14: Return response
  const responseBody = {
    access_token: newAccessToken,
    token_type: "Bearer",
    expires_in: 3600,
    id_token: idToken,
    refresh_token: newRefreshToken,
  };

  return NextResponse.json(responseBody, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...corsHeaders,
    },
  });
}

/**
 * POST /api/oidc/token
 *
 * Token endpoint supporting authorization_code and refresh_token grant types.
 * Enforces rate limiting of 20 requests/min per client_id (Requirement 10.1).
 * Includes CORS headers for cross-origin access (Requirement 10.2).
 */
export async function POST(request) {
  try {
    const body = await parseBody(request);
    const { grant_type } = body;

    // Validate grant_type
    if (!grant_type) {
      return errorResponse(
        "invalid_request",
        "grant_type parameter is required"
      );
    }

    if (
      grant_type !== "authorization_code" &&
      grant_type !== "refresh_token"
    ) {
      return errorResponse(
        "unsupported_grant_type",
        "Only authorization_code and refresh_token grant types are supported"
      );
    }

    // Extract client_id for rate limiting
    // Try from body first, then from Authorization header (Basic auth)
    let clientId = body.client_id;
    if (!clientId) {
      const authHeader = request.headers.get("authorization") || "";
      if (authHeader.startsWith("Basic ")) {
        try {
          const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
          const colonIndex = decoded.indexOf(":");
          if (colonIndex > 0) {
            clientId = decodeURIComponent(decoded.slice(0, colonIndex));
          }
        } catch {
          // If decoding fails, clientId remains undefined — rate limiting will be skipped
        }
      }
    }

    // Apply rate limiting if client_id is available
    if (clientId) {
      const rateLimitResult = checkRateLimit(clientId);
      if (!rateLimitResult.allowed) {
        return errorResponse(
          "too_many_requests",
          "Rate limit exceeded. Try again later.",
          429
        );
      }
    }

    // Route to appropriate handler
    if (grant_type === "authorization_code") {
      return await handleAuthorizationCodeGrant(request, body);
    }

    if (grant_type === "refresh_token") {
      return await handleRefreshTokenGrant(request, body);
    }
  } catch (error) {
    console.error("Token endpoint error:", error);
    return errorResponse(
      "server_error",
      "An internal server error occurred",
      500
    );
  }
}
