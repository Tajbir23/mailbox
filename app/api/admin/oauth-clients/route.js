import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import OAuthClient from "@/lib/models/OAuthClient";
import UserConsent from "@/lib/models/UserConsent";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// GET /api/admin/oauth-clients – list all clients with active authorization counts
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const clients = await OAuthClient.find({}).sort({ createdAt: -1 }).lean();

    // Get active authorization counts per client
    const consentCounts = await UserConsent.aggregate([
      { $group: { _id: "$client_id", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    consentCounts.forEach((c) => {
      countMap[c._id] = c.count;
    });

    const enrichedClients = clients.map((client) => ({
      ...client,
      activeAuthorizations: countMap[client.client_id] || 0,
    }));

    return NextResponse.json({ clients: enrichedClients });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/admin/oauth-clients – create new OAuth client
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await request.json();

    const { display_name, redirect_uris, allowed_scopes, client_type } = body;

    if (!display_name) {
      return NextResponse.json(
        { error: "display_name is required" },
        { status: 400 }
      );
    }

    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return NextResponse.json(
        { error: "At least one redirect_uri is required" },
        { status: 400 }
      );
    }

    // Generate client_id and client_secret
    const client_id = crypto.randomBytes(16).toString("hex");
    const client_secret = crypto.randomBytes(32).toString("hex");
    const client_secret_hash = await bcrypt.hash(client_secret, 12);

    const client = await OAuthClient.create({
      client_id,
      client_secret_hash,
      client_type: client_type || "confidential",
      display_name,
      redirect_uris,
      allowed_scopes: allowed_scopes || ["openid", "profile", "email"],
      active: true,
    });

    // Return client_secret in plain text only once
    return NextResponse.json({
      message: "OAuth client created successfully",
      client: {
        _id: client._id,
        client_id: client.client_id,
        client_secret, // Only displayed once
        client_type: client.client_type,
        display_name: client.display_name,
        redirect_uris: client.redirect_uris,
        allowed_scopes: client.allowed_scopes,
        active: client.active,
        createdAt: client.createdAt,
      },
    }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
