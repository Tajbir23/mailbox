/**
 * OIDC UserInfo Endpoint
 *
 * Returns claims about the authenticated user based on the granted scopes
 * of the presented access token. Supports both GET and POST methods.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import dbConnect from "@/lib/mongodb";
import OIDCToken from "@/lib/models/OIDCToken";
import User from "@/lib/models/User";
import { hashToken } from "@/lib/oidc/tokens";

export const dynamic = "force-dynamic";

/**
 * Extract Bearer token from the Authorization header.
 * @param {Request} request
 * @returns {string|null} The raw token string, or null if not present/malformed
 */
function extractBearerToken(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

/**
 * Build a 401 error response with WWW-Authenticate header.
 */
function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Bearer error="invalid_token"',
      "Content-Type": "application/json",
    },
  });
}

/**
 * Core handler for the UserInfo endpoint (shared by GET and POST).
 */
async function handleUserInfo(request) {
  // 1. Extract Bearer token from Authorization header
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedResponse();
  }

  // 2. Hash the token for database lookup
  const tokenHash = hashToken(token);

  await dbConnect();

  // 3. Look up the token hash in OIDCToken model
  const tokenRecord = await OIDCToken.findOne({
    token_hash: tokenHash,
    token_type: "access_token",
    revoked: false,
  });

  // 4. If not found, return 401
  if (!tokenRecord) {
    return unauthorizedResponse();
  }

  // 5. If found but expired, return 401
  if (tokenRecord.expiresAt < new Date()) {
    return unauthorizedResponse();
  }

  // 6. Fetch user from User model using the token's user_id
  const user = await User.findById(tokenRecord.user_id).lean();
  if (!user) {
    return unauthorizedResponse();
  }

  // 7. Build claims based on the token's scopes
  const scopes = tokenRecord.scopes || [];
  const claims = {};

  // Always include sub when openid scope is present
  if (scopes.includes("openid")) {
    claims.sub = user._id.toString();
  }

  // Include name when profile scope is granted
  if (scopes.includes("profile")) {
    claims.name = user.name;
  }

  // Include email and email_verified when email scope is granted
  if (scopes.includes("email")) {
    claims.email = user.email;
    claims.email_verified = true;
  }

  // 8. Return JSON with claims
  return new Response(JSON.stringify(claims), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function GET(request) {
  return handleUserInfo(request);
}

export async function POST(request) {
  return handleUserInfo(request);
}
