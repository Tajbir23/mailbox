import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import OAuthClient from "@/lib/models/OAuthClient";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// POST /api/admin/oauth-clients/[id]/regenerate-secret – generate new client secret
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const { id } = await params;
    const client = await OAuthClient.findById(id).select("+client_secret_hash");

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.active) {
      return NextResponse.json(
        { error: "Cannot regenerate secret for an inactive client" },
        { status: 400 }
      );
    }

    // Generate new secret
    const client_secret = crypto.randomBytes(32).toString("hex");
    const client_secret_hash = await bcrypt.hash(client_secret, 12);

    // Update with new hash (invalidates previous secret)
    client.client_secret_hash = client_secret_hash;
    await client.save();

    return NextResponse.json({
      message: "Client secret regenerated successfully",
      client_id: client.client_id,
      client_secret, // Display only once
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
