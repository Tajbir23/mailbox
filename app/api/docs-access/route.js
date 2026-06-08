export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import SiteSetting from "@/lib/models/SiteSetting";

const ALLOWED_VISIBILITY = ["public", "authenticated", "admin", "disabled"];

// GET /api/docs-access – PUBLIC endpoint reporting docs visibility + access
export async function GET() {
  try {
    await dbConnect();

    const setting = await SiteSetting.findOne({ key: "docs_visibility" }).lean();
    let visibility = setting?.value ?? "public";
    if (!ALLOWED_VISIBILITY.includes(visibility)) {
      visibility = "public";
    }

    const session = await getServerSession(authOptions);

    let allowed = false;
    switch (visibility) {
      case "public":
        allowed = true;
        break;
      case "authenticated":
        allowed = Boolean(session?.user);
        break;
      case "admin":
        allowed = session?.user?.role === "admin";
        break;
      case "disabled":
        allowed = false;
        break;
      default:
        allowed = false;
    }

    return NextResponse.json({ visibility, allowed });
  } catch (err) {
    console.error("Docs access error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
