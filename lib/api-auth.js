import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import ApiKey from "@/lib/models/ApiKey";
import User from "@/lib/models/User";

const KEY_PREFIX = "mb_";

export function generateApiKey() {
  const raw = KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

export function hashApiKey(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Resolve the authenticated user from either:
 *  - a NextAuth session cookie, OR
 *  - an `Authorization: Bearer mb_...` API key header.
 *
 * Returns { id, role, source: "session"|"apiKey" } or null.
 */
export async function getAuthUser(request) {
  const authHeader = request?.headers?.get?.("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const raw = authHeader.slice(7).trim();
    if (!raw.startsWith(KEY_PREFIX)) return null;

    await dbConnect();
    const hash = hashApiKey(raw);
    const key = await ApiKey.findOne({ keyHash: hash, revokedAt: null });
    if (!key) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;

    const user = await User.findById(key.userId).select("role").lean();
    if (!user) return null;

    // Fire-and-forget lastUsedAt update — don't block the request.
    ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } })
      .catch(() => {});

    return { id: key.userId.toString(), role: user.role, source: "apiKey" };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return { id: session.user.id, role: session.user.role, source: "session" };
}

// Wrap a route handler so uncaught errors become JSON 500 (preserving the
// API's JSON contract instead of Next's default HTML error page).
export function apiHandler(handler) {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      // Malformed ObjectId in a path/body param — return 400 instead of 500.
      if (err?.name === "CastError" || err?.name === "BSONError") {
        return NextResponse.json(
          { error: `Invalid ${err.path || "id"} format` },
          { status: 400 }
        );
      }
      // Validation errors (Mongoose schema)
      if (err?.name === "ValidationError") {
        return NextResponse.json(
          { error: err.message || "Validation failed" },
          { status: 400 }
        );
      }
      console.error("[api]", err);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}
