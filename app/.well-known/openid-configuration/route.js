export const dynamic = "force-dynamic";

import { getIssuerUrl } from "@/lib/oidc/keys";

/**
 * GET /.well-known/openid-configuration
 *
 * Returns the OIDC Discovery document containing provider metadata,
 * endpoint URLs, and supported capabilities.
 */
export async function GET() {
  const issuer = getIssuerUrl();

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
