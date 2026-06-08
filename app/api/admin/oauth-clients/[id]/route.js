import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import OAuthClient from "@/lib/models/OAuthClient";
import UserConsent from "@/lib/models/UserConsent";
import OIDCToken from "@/lib/models/OIDCToken";

export const dynamic = "force-dynamic";

// GET /api/admin/oauth-clients/[id] – get client detail with consent count
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const { id } = await params;
    const client = await OAuthClient.findById(id).lean();

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get count of users who have granted consent
    const consentCount = await UserConsent.countDocuments({
      client_id: client.client_id,
    });

    return NextResponse.json({
      client: {
        ...client,
        consentCount,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/admin/oauth-clients/[id] – update client
export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const { id } = await params;
    const body = await request.json();

    const client = await OAuthClient.findById(id);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Only allow updating specific fields
    const allowedUpdates = ["display_name", "redirect_uris", "allowed_scopes", "active"];
    const updates = {};

    for (const field of allowedUpdates) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updatedClient = await OAuthClient.findByIdAndUpdate(id, updates, {
      new: true,
    }).lean();

    return NextResponse.json({
      message: "Client updated successfully",
      client: updatedClient,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/admin/oauth-clients/[id] – mark inactive and revoke all tokens
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const { id } = await params;
    const client = await OAuthClient.findById(id);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Mark client as inactive
    client.active = false;
    await client.save();

    // Revoke all tokens for this client
    await OIDCToken.updateMany(
      { client_id: client.client_id, revoked: false },
      { revoked: true }
    );

    // Delete all consent records for this client
    const deletedConsents = await UserConsent.deleteMany({
      client_id: client.client_id,
    });

    return NextResponse.json({
      message: "Client deactivated and all tokens revoked",
      revokedConsents: deletedConsents.deletedCount,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
