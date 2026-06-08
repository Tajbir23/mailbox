export const dynamic = "force-dynamic";

import { getIssuerFromHeaders } from "@/lib/oidc/keys";

/**
 * GET /.well-known/openid-configuration
 *
 * Returns the OIDC Discovery document containing provider metadata,
 * endpoint URLs, and supported capabilities.
 *
 * The issuer (and all endpoint URLs) are derived from the request host so
 * that white-label custom domains each act as their own OIDC issuer.
 */
export async function GET(request) {
  const issuer = getIssuerFromHeaders(request.headers);

  const configuration = {
    issuer,
    authorization_endpoint: `${issuer}/api/oidc/authorize`,
    token_endpoint: `${issuer}/api/oidc/token`,
    userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    revocation_endpoint: `${issuer}/api/oidc/revoke`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
  };

  return new Response(JSON.stringify(configuration), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

/**
 * OPTIONS /.well-known/openid-configuration
 *
 * Handle CORS preflight requests.
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
