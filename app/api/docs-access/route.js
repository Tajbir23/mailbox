export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import SiteSetting from "@/lib/models/SiteSetting";
import User from "@/lib/models/User";

const ALLOWED_VISIBILITY = ["public", "authenticated", "admin", "custom", "disabled"];

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
      case "custom":
        // Admins always allowed; otherwise the user needs the canViewDocs flag.
        if (session?.user?.role === "admin") {
          allowed = true;
        } else if (session?.user?.id) {
          const u = await User.findById(session.user.id).select("canViewDocs").lean();
          allowed = Boolean(u?.canViewDocs);
        } else {
          allowed = false;
        }
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
