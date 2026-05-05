import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import ApiKey from "@/lib/models/ApiKey";
import { generateApiKey, apiHandler } from "@/lib/api-auth";

// API key management is intentionally session-only — you cannot mint or list
// keys with another key. This prevents a leaked key from escalating itself.

export const GET = apiHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const keys = await ApiKey.find({ userId: session.user.id, revokedAt: null })
    .sort({ createdAt: -1 })
    .select("name keyPrefix lastUsedAt expiresAt createdAt")
    .lean();

  return NextResponse.json(keys);
});

export const POST = apiHandler(async (request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").toString().trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let expiresAt = null;
  if (body.expiresAt) {
    const d = new Date(body.expiresAt);
    if (isNaN(d.getTime()) || d <= new Date()) {
      return NextResponse.json(
        { error: "expiresAt must be a future date" },
        { status: 400 }
      );
    }
    expiresAt = d;
  }

  const activeCount = await ApiKey.countDocuments({
    userId: session.user.id,
    revokedAt: null,
  });
  if (activeCount >= 20) {
    return NextResponse.json(
      { error: "API key limit (20) reached. Revoke an unused one first." },
      { status: 400 }
    );
  }

  const { raw, hash, prefix } = generateApiKey();
  const created = await ApiKey.create({
    userId: session.user.id,
    name,
    keyHash: hash,
    keyPrefix: prefix,
    expiresAt,
  });

  return NextResponse.json(
    {
      id: created._id.toString(),
      name: created.name,
      keyPrefix: created.keyPrefix,
      key: raw,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
    },
    { status: 201 }
  );
});
