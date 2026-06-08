/**
 * OIDC Client Info API
 *
 * Returns public information about a registered OAuth client.
 * Used by the consent screen to display the Relying Party's name.
 *
 * GET /api/oidc/client-info?client_id=xxx
 */

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import OAuthClient from "@/lib/models/OAuthClient";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");

  if (!clientId) {
    return NextResponse.json(
      { error: "client_id parameter is required" },
      { status: 400 }
    );
  }

  await dbConnect();

  const client = await OAuthClient.findOne(
    { client_id: clientId, active: true },
    { display_name: 1, redirect_uris: 1, _id: 0 }
  );

  if (!client) {
    return NextResponse.json(
      { error: "Client not found or inactive" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    display_name: client.display_name,
    redirect_uris: client.redirect_uris,
  });
}
