import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import UserConsent from "@/lib/models/UserConsent";
import OIDCToken from "@/lib/models/OIDCToken";
import User from "@/lib/models/User";

export const dynamic = "force-dynamic";

// GET /api/admin/oauth-clients/authorizations – list all user-client consent records
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const consents = await UserConsent.find({})
      .sort({ granted_at: -1 })
      .lean();

    // Get user info for each consent
    const userIds = [...new Set(consents.map((c) => c.user_id))];
    const users = await User.find({ _id: { $in: userIds } })
      .select("name email")
      .lean();

    const userMap = {};
    users.forEach((u) => {
      userMap[u._id.toString()] = { name: u.name, email: u.email };
    });

    const enrichedConsents = consents.map((consent) => ({
      ...consent,
      user: userMap[consent.user_id.toString()] || { name: "Unknown", email: "Unknown" },
    }));

    return NextResponse.json({ authorizations: enrichedConsents });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/admin/oauth-clients/authorizations – revoke specific authorization
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");
    const client_id = searchParams.get("client_id");

    if (!user_id || !client_id) {
      return NextResponse.json(
        { error: "user_id and client_id are required" },
        { status: 400 }
      );
    }

    // Delete the consent record
    const deletedConsent = await UserConsent.findOneAndDelete({
      user_id,
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
      { user_id, client_id, revoked: false },
      { revoked: true }
    );

    return NextResponse.json({
      message: "Authorization revoked and all tokens invalidated",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
