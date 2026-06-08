export const dynamic = "force-dynamic";

import { samlUrls, getCertDerBase64 } from "@/lib/saml/keys";
import { buildMetadata } from "@/lib/saml/metadata";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * OPTIONS /api/saml/metadata – CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/saml/metadata – Return the SAML IdP metadata XML
 *
 * Derives the host-based entityID and SSO URL from the request headers, embeds
 * the signing certificate, and returns the metadata document. Metadata is
 * public, so CORS is fully open.
 */
export async function GET(request) {
  try {
    const { entityId, ssoUrl } = samlUrls(request.headers);
    const certDerBase64 = getCertDerBase64();
    const xml = buildMetadata({ entityId, ssoUrl, certDerBase64 });

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/samlmetadata+xml",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("SAML metadata endpoint error:", err.message);
    return new Response("Failed to generate SAML metadata", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
