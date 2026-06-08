import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import SiteSetting from "@/lib/models/SiteSetting";

export const dynamic = "force-dynamic";

// Known settings and their validation/defaults
const SETTINGS = {
  docs_visibility: {
    default: "public",
    allowed: ["public", "authenticated", "admin", "disabled"],
  },
};

// GET /api/admin/settings – return an object map of all site settings
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const settings = await SiteSetting.find({}).lean();

    // Build a map seeded with defaults, then override with stored values
    const map = {};
    for (const [key, def] of Object.entries(SETTINGS)) {
      map[key] = def.default;
    }
    for (const s of settings) {
      map[s.key] = s.value;
    }

    return NextResponse.json(map);
  } catch (err) {
    console.error("Get settings error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/admin/settings – update a single setting { key, value }
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await request.json();
    const { key, value } = body || {};

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const def = SETTINGS[key];
    if (!def) {
      return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
    }

    if (def.allowed && !def.allowed.includes(value)) {
      return NextResponse.json(
        { error: `Invalid value for ${key}` },
        { status: 400 }
      );
    }

    const updated = await SiteSetting.findOneAndUpdate(
      { key },
      { key, value },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ key: updated.key, value: updated.value });
  } catch (err) {
    console.error("Update setting error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
