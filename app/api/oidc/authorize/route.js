/**
 * OIDC Authorization Endpoint
 *
 * Handles the authorization code flow for OpenID Connect.
 * Supports both GET and POST requests.
 *
 * Flow:
 * 1. Validate client_id and redirect_uri (error page if invalid)
 * 2. Validate remaining params (response_type, scope, PKCE)
 * 3. Check user session — redirect to login if not authenticated
 * 4. Check existing consent — skip consent if scopes already granted
 * 5. Redirect to consent screen if new consent needed
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 7.2, 7.3, 11.1, 11.2, 11.3
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  validateAuthRequest,
  validatePKCE,
  parseScopes,
  isScopeSubset,
} from "@/lib/oidc/authorize";
import UserConsent from "@/lib/models/UserConsent";
import { generateAuthorizationCode } from "@/lib/oidc/code";
import dbConnect from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * Render an HTML error page for client validation failures.
 * We MUST NOT redirect to an unregistered redirect_uri.
 */
function errorPageResponse(error, errorDescription) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorization Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .container { max-width: 480px; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: #dc2626; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #4b5563; line-height: 1.5; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Error</h1>
    <p><strong>Error:</strong> <code>${error}</code></p>
    <p>${errorDescription}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Extract authorization parameters from either query string (GET) or form body (POST).
 */
async function extractParams(request) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    return {
      client_id: url.searchParams.get("client_id"),
      redirect_uri: url.searchParams.get("redirect_uri"),
      response_type: url.searchParams.get("response_type"),
      scope: url.searchParams.get("scope"),
      state: url.searchParams.get("state"),
      nonce: url.searchParams.get("nonce"),
      code_challenge: url.searchParams.get("code_challenge"),
      code_challenge_method: url.searchParams.get("code_challenge_method"),
    };
  }

  // POST — read from form body or JSON
  const contentType = request.headers.get("content-type") || "";
  let body;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
  } else {
    body = await request.json().catch(() => ({}));
  }

  return {
    client_id: body.client_id || url.searchParams.get("client_id"),
    redirect_uri: body.redirect_uri || url.searchParams.get("redirect_uri"),
    response_type: body.response_type || url.searchParams.get("response_type"),
    scope: body.scope || url.searchParams.get("scope"),
    state: body.state || url.searchParams.get("state"),
    nonce: body.nonce || url.searchParams.get("nonce"),
    code_challenge: body.code_challenge || url.searchParams.get("code_challenge"),
    code_challenge_method: body.code_challenge_method || url.searchParams.get("code_challenge_method"),
  };
}

/**
 * Core authorization logic shared between GET and POST.
 */
async function handleAuthorize(request) {
  const params = await extractParams(request);
  const {
    client_id,
    redirect_uri,
    response_type,
    scope,
    state,
    nonce,
    code_challenge,
    code_challenge_method,
  } = params;

  // Step 1: Validate the authorization request (client_id, redirect_uri, response_type, scope)
  const validation = await validateAuthRequest({
    client_id,
    redirect_uri,
    response_type,
    scope,
  });

  if (!validation.valid) {
    // If the error is related to client_id or redirect_uri, show error page (don't redirect)
    const clientErrors = ["unauthorized_client", "invalid_request"];
    const isClientOrRedirectError =
      clientErrors.includes(validation.error) &&
      (validation.error_description.includes("client_id") ||
        validation.error_description.includes("redirect_uri") ||
        validation.error_description.includes("Unknown") ||
        validation.error_description.includes("not active") ||
        validation.error_description.includes("not match"));

    if (isClientOrRedirectError || !redirect_uri || !client_id) {
      return errorPageResponse(validation.error, validation.error_description);
    }

    // For other validation errors (bad response_type, bad scope), redirect with error
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("error", validation.error);
    redirectUrl.searchParams.set("error_description", validation.error_description);
    if (state) redirectUrl.searchParams.set("state", state);
    return NextResponse.redirect(redirectUrl.toString(), 302);
  }

  const client = validation.client;

  // Step 2: Validate PKCE parameters
  const pkceValidation = validatePKCE(
    { code_challenge, code_challenge_method },
    client.client_type
  );

  if (!pkceValidation.valid) {
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("error", pkceValidation.error);
    redirectUrl.searchParams.set("error_description", pkceValidation.error_description);
    if (state) redirectUrl.searchParams.set("state", state);
    return NextResponse.redirect(redirectUrl.toString(), 302);
  }

  // Step 3: Check for active NextAuth.js session
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    // Not authenticated — redirect to login page with return URL
    const currentUrl = new URL(request.url);
    const authorizeUrl = new URL("/api/oidc/authorize", currentUrl.origin);
    authorizeUrl.searchParams.set("client_id", client_id);
    authorizeUrl.searchParams.set("redirect_uri", redirect_uri);
    authorizeUrl.searchParams.set("response_type", response_type);
    authorizeUrl.searchParams.set("scope", scope);
    if (state) authorizeUrl.searchParams.set("state", state);
    if (nonce) authorizeUrl.searchParams.set("nonce", nonce);
    if (code_challenge) authorizeUrl.searchParams.set("code_challenge", code_challenge);
    if (code_challenge_method) authorizeUrl.searchParams.set("code_challenge_method", code_challenge_method);

    const loginUrl = new URL("/login", currentUrl.origin);
    loginUrl.searchParams.set("callbackUrl", authorizeUrl.toString());

    return NextResponse.redirect(loginUrl.toString(), 302);
  }

  // Step 4: User is authenticated — check for existing consent
  const userId = session.user.id;
  const requestedScopes = parseScopes(scope);

  await dbConnect();
  const existingConsent = await UserConsent.findOne({
    user_id: userId,
    client_id,
  });

  if (existingConsent && isScopeSubset(existingConsent.granted_scopes, requestedScopes)) {
    // Consent already covers requested scopes — generate code and redirect
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

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);
    return NextResponse.redirect(redirectUrl.toString(), 302);
  }

  // Step 5: No consent or additional scopes needed — redirect to consent screen
  const currentUrl = new URL(request.url);
  const consentUrl = new URL("/oidc/consent", currentUrl.origin);
  consentUrl.searchParams.set("client_id", client_id);
  consentUrl.searchParams.set("redirect_uri", redirect_uri);
  consentUrl.searchParams.set("scope", scope);
  if (state) consentUrl.searchParams.set("state", state);
  if (nonce) consentUrl.searchParams.set("nonce", nonce);
  if (code_challenge) consentUrl.searchParams.set("code_challenge", code_challenge);
  if (code_challenge_method) consentUrl.searchParams.set("code_challenge_method", code_challenge_method);

  return NextResponse.redirect(consentUrl.toString(), 302);
}

export async function GET(request) {
  return handleAuthorize(request);
}

export async function POST(request) {
  return handleAuthorize(request);
}
