/**
 * SAML 2.0 IdP Single Sign-On (SSO) Endpoint
 *
 * Handles SP-initiated SSO for both SAML bindings via a shared handler:
 *   - GET  -> HTTP-Redirect binding (SAMLRequest is DEFLATE+base64 in query)
 *   - POST -> HTTP-POST binding     (SAMLRequest is base64 in the form body)
 *
 * Flow:
 *   1. Extract SAMLRequest + RelayState (query for GET, form for POST).
 *   2. Decode (by binding) and parse the AuthnRequest. Malformed -> HTML 400,
 *      no SAML_Response generated.
 *   3. dbConnect(); look up an active SAMLClient by Issuer; resolve the ACS URL
 *      against the record allow-list. Failure -> HTML 403/400, no SAML_Response.
 *   4. Check the NextAuth session. No session -> 302 redirect to /login with the
 *      SAML params preserved so the flow resumes after login (GET resume).
 *   5. With a session -> build + sign the Response and return an auto-submitting
 *      HTML form that HTTP-POSTs the SAMLResponse to the record-derived ACS URL.
 *
 * SECURITY / multi-domain: every externally visible origin/entityID is derived
 * from the request HEADERS (getEntityIdFromHeaders), never from request.url,
 * because behind the Caddy reverse proxy request.url resolves to 127.0.0.1:3000.
 * The auto-POST form action is ALWAYS the record-derived ACS URL, never one
 * supplied solely by the request (open-relay protection).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.x, 7.1, 7.2,
 * 7.3, 7.4, 8.2, 8.3, 8.4, 8.5, 8.6, 11.1, 11.5, 12.5
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import SAMLClient from "@/lib/models/SAMLClient";
import User from "@/lib/models/User";
import {
  decodeRedirect,
  decodePost,
  parseAuthnRequest,
  AuthnRequestError,
} from "@/lib/saml/authn-request";
import { resolveClientAndAcs } from "@/lib/saml/acs";
import { buildResponse } from "@/lib/saml/response";
import { signAssertion } from "@/lib/saml/sign";
import { getEntityIdFromHeaders } from "@/lib/saml/keys";

export const dynamic = "force-dynamic";

/**
 * Escape a string for safe inclusion inside an HTML attribute value or text.
 * Escapes &, <, >, ", and '.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a simple HTML error page response with the given status.
 * We MUST NOT generate a SAML_Response or redirect to an unverified ACS here.
 * @param {number} status
 * @param {string} message
 * @returns {NextResponse}
 */
function errorPage(status, message) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAML Single Sign-On Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .container { max-width: 480px; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: #dc2626; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #4b5563; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Single Sign-On Error</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Build the auto-submitting HTML POST form that delivers the SAML_Response to
 * the SP's ACS URL. Auto-submits on load, with a noscript fallback button.
 * All injected values are HTML-attribute escaped.
 *
 * @param {string} acsUrl - Record-derived ACS URL (form action).
 * @param {string} samlResponseB64 - base64-encoded signed SAML_Response.
 * @param {string|null} relayState - RelayState to echo (omitted when absent).
 * @returns {NextResponse}
 */
function autoPostForm(acsUrl, samlResponseB64, relayState) {
  const relayStateField =
    relayState != null && relayState !== ""
      ? `\n    <input type="hidden" name="RelayState" value="${escapeHtml(relayState)}" />`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signing you in…</title>
</head>
<body onload="document.forms[0].submit()">
  <noscript>
    <p>JavaScript is disabled. Click the button below to continue.</p>
  </noscript>
  <form method="POST" action="${escapeHtml(acsUrl)}">
    <input type="hidden" name="SAMLResponse" value="${escapeHtml(samlResponseB64)}" />${relayStateField}
    <noscript><input type="submit" value="Continue" /></noscript>
  </form>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Map an ACS resolution failure reason to an HTTP status and message.
 * @param {string} reason
 * @returns {{ status: number, message: string }}
 */
function acsFailureResponse(reason) {
  switch (reason) {
    case "unknown_sp":
      return {
        status: 403,
        message: "The requesting Service Provider is not registered or is inactive.",
      };
    case "acs_not_allowed":
      return {
        status: 400,
        message: "The requested Assertion Consumer Service URL is not allowed for this Service Provider.",
      };
    case "no_acs":
      return {
        status: 400,
        message: "No Assertion Consumer Service URL was provided and the Service Provider has no default configured.",
      };
    default:
      return { status: 400, message: "The Service Provider request could not be processed." };
  }
}

/**
 * Shared SSO handler for both bindings.
 * @param {Request} request
 * @param {"redirect"|"post"} binding
 * @returns {Promise<NextResponse>}
 */
async function handleSso(request, binding) {
  // Step 1: Extract SAMLRequest + RelayState.
  //
  // The SOURCE depends on the HTTP method: a native HTTP-POST binding carries
  // the values in the form body, while a GET (native HTTP-Redirect binding OR a
  // post-binding flow resuming after login) carries them in the query string.
  // The `binding` argument only selects the DECODER (deflate vs plain base64).
  let samlRequest = null;
  let relayState = null;

  if (request.method === "POST") {
    const form = await request.formData();
    const sr = form.get("SAMLRequest");
    const rs = form.get("RelayState");
    samlRequest = typeof sr === "string" ? sr : null;
    relayState = typeof rs === "string" ? rs : null;
  } else {
    // request.url host is wrong behind the proxy, but its search params are fine.
    const { searchParams } = new URL(request.url);
    samlRequest = searchParams.get("SAMLRequest");
    relayState = searchParams.get("RelayState");
  }

  // Step 2: Decode + parse the AuthnRequest. Any failure -> HTTP 400, no response.
  let parsed;
  try {
    const xml =
      binding === "redirect" ? decodeRedirect(samlRequest) : decodePost(samlRequest);
    parsed = parseAuthnRequest(xml);
  } catch (err) {
    if (err instanceof AuthnRequestError) {
      return errorPage(400, `Invalid SAML AuthnRequest: ${err.message}`);
    }
    return errorPage(400, "The SAML AuthnRequest could not be decoded or parsed.");
  }

  // Step 3: Look up the SP record and resolve the ACS URL.
  await dbConnect();
  const client = await SAMLClient.findOne({
    sp_entity_id: parsed.issuer,
    active: true,
  });

  const resolved = resolveClientAndAcs(client, parsed.acsUrl);
  if (!resolved.ok) {
    const { status, message } = acsFailureResponse(resolved.reason);
    return errorPage(status, message);
  }

  // Step 4: Session check. No session -> redirect to login, preserving the SAML
  // flow so it resumes (always via a GET that re-uses the original decoder).
  const origin = getEntityIdFromHeaders(request.headers);
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    // Resume always via query params so the resume is a GET. Preserve the
    // ORIGINAL samlRequest string and original binding so the correct decoder
    // (decodeRedirect vs decodePost) is used on resume.
    let callbackUrl =
      `${origin}/api/saml/sso?SAMLRequest=${encodeURIComponent(samlRequest)}` +
      `&binding=${binding}`;
    if (relayState) {
      callbackUrl += `&RelayState=${encodeURIComponent(relayState)}`;
    }

    const loginUrl = `${origin}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    return NextResponse.redirect(loginUrl, 302);
  }

  // Step 5: Authenticated — resolve the user's email/name, build + sign the
  // Response, and return the auto-POST form.
  let email = session.user.email;
  let name = session.user.name;

  // Fallback: if the session somehow lacks an email, load it from the DB by id.
  if (!email && session.user.id) {
    const dbUser = await User.findById(session.user.id);
    if (dbUser) {
      email = dbUser.email;
      if (!name) name = dbUser.name;
    }
  }

  if (!email) {
    return errorPage(500, "Unable to determine the authenticated user's email address.");
  }

  const user = { id: session.user.id, email, name };
  const entityId = getEntityIdFromHeaders(request.headers);

  const { xml, assertionId } = buildResponse({
    entityId,
    acsUrl: resolved.acsUrl,
    inResponseTo: parsed.id,
    spEntityId: parsed.issuer,
    user,
    nameIdFormat: client.nameid_format,
    attributeMapping: client.attribute_mapping,
    now: new Date(),
  });

  const signedXml = signAssertion(xml, assertionId);
  const samlResponseB64 = Buffer.from(signedXml, "utf-8").toString("base64");

  return autoPostForm(resolved.acsUrl, samlResponseB64, relayState);
}

export async function GET(request) {
  // The native HTTP-Redirect binding uses "redirect". When a POST-binding flow
  // resumes after login it does so via a GET carrying ?binding=post (the
  // original samlRequest is plain base64, not deflated), so honor that param
  // to select the correct decoder on resume.
  const { searchParams } = new URL(request.url);
  const binding = searchParams.get("binding") === "post" ? "post" : "redirect";
  return handleSso(request, binding);
}

export async function POST(request) {
  // Native HTTP-POST binding: SAMLRequest arrives in the form body.
  return handleSso(request, "post");
}
