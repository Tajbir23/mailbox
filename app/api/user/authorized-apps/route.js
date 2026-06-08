import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import UserConsent from "@/lib/models/UserConsent";
import OAuthClient from "@/lib/models/OAuthClient";
import OIDCToken from "@/lib/models/OIDCToken";

export const dynamic = "force-dynamic";

// GET /api/user/authorized-apps – list apps the current user has consented to
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const consents = await UserConsent.find({ user_id: session.user.id })
      .sort({ granted_at: -1 })
      .lean();

    if (consents.length === 0) {
      return NextResponse.json({ apps: [] });
    }

    // Get display names for all clients
    const clientIds = consents.map((c) => c.client_id);
    const clients = await OAuthClient.find({ client_id: { $in: clientIds } })
      .select("client_id display_name")
      .lean();

    const clientMap = {};
    clients.forEach((c) => {
      clientMap[c.client_id] = c.display_name;
    });

    const apps = consents.map((consent) => ({
      client_id: consent.client_id,
      display_name: clientMap[consent.client_id] || consent.client_id,
      granted_scopes: consent.granted_scopes,
      granted_at: consent.granted_at,
    }));

    return NextResponse.json({ apps });
  } catch (err) {
    console.error("Error fetching authorized apps:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/user/authorized-apps?client_id=xxx – revoke consent and invalidate tokens
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const client_id = searchParams.get("client_id");

    if (!client_id) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    // Delete the consent record
    const deletedConsent = await UserConsent.findOneAndDelete({
      user_id: session.user.id,
      client_id,
    });

    if (!deletedConsent) {
      return NextResponse.json(
        { error: "Authorization not found" },
        { status: 404 }
      );
    }

    // Revoke all tokens for this user-client pair
    await OIDCToken.updateMany(
      { user_id: session.user.id, client_id, revoked: false },
      { revoked: true }
    );

    return NextResponse.json({
      message: "Access revoked and all tokens invalidated",
    });
  } catch (err) {
    console.error("Error revoking authorization:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
