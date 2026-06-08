/**
 * OIDC Consent Endpoint
 *
 * Handles POST requests when a user approves consent on the consent screen.
 *
 * Flow:
 * 1. Verify active session (401 if not authenticated)
 * 2. Re-validate authorization request parameters (security)
 * 3. Re-validate PKCE if present
 * 4. Upsert UserConsent record with granted scopes (Set union with existing)
 * 5. Generate AuthorizationCode
 * 6. Return redirect URL as JSON { redirect: "redirect_uri?code=xxx&state=yyy" }
 *
 * Requirements: 3.5, 7.5, 7.2
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { validateAuthRequest, validatePKCE, parseScopes } from "@/lib/oidc/authorize";
import UserConsent from "@/lib/models/UserConsent";
import { generateAuthorizationCode } from "@/lib/oidc/code";
import dbConnect from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function POST(request) {
  // Step 1: Verify active session
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: "unauthorized", error_description: "Authentication required" },
      { status: 401 }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Invalid request body" },
      { status: 400 }
    );
  }

  const {
    client_id,
    redirect_uri,
    scope,
    state,
    nonce,
    code_challenge,
    code_challenge_method,
  } = body;

  // Step 2: Re-validate authorization request parameters
  const validation = await validateAuthRequest({
    client_id,
    redirect_uri,
    response_type: "code",
    scope,
  });

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error, error_description: validation.error_description },
      { status: 400 }
    );
  }

  const client = validation.client;

  // Step 3: Re-validate PKCE if present
  const pkceValidation = validatePKCE(
    { code_challenge, code_challenge_method },
    client.client_type
  );

  if (!pkceValidation.valid) {
    return NextResponse.json(
      { error: pkceValidation.error, error_description: pkceValidation.error_description },
      { status: 400 }
    );
  }

  // Step 4: Upsert UserConsent record
  const userId = session.user.id;
  const requestedScopes = parseScopes(scope);

  await dbConnect();

  // Merge with existing granted scopes using Set union
  const existingConsent = await UserConsent.findOne({ user_id: userId, client_id });
  const previousScopes = existingConsent ? existingConsent.granted_scopes : [];
  const mergedScopes = [...new Set([...previousScopes, ...requestedScopes])];

  await UserConsent.findOneAndUpdate(
    { user_id: userId, client_id },
    {
      granted_scopes: mergedScopes,
      granted_at: new Date(),
    },
    { upsert: true }
  );

  // Step 5: Generate AuthorizationCode
  const code = await generateAuthorizationCode({
    client_id,
    user_id: userId,
    redirect_uri,
    scopes: requestedScopes,
    state,
    nonce,
    code_challenge,
    code_challenge_method,
  });

  // Step 6: Build redirect URL and return as JSON
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return NextResponse.json({ redirect: redirectUrl.toString() });
}
