export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getJWKS } from "@/lib/oidc/keys";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * OPTIONS /.well-known/jwks.json – CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /.well-known/jwks.json – Return the public RSA key in JWKS format
 */
export async function GET() {
  try {
    const jwks = getJWKS();

    return NextResponse.json(jwks, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("JWKS endpoint error:", err.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
