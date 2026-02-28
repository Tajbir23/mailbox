import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";

// GET /api/domains – list domains available to the current user for mailbox creation
// Only verified & active domains are shown
// Public verified domains + user's own verified private domains
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const userId = session.user.id;

    const domains = await Domain.find({
      isActive: true,
      verificationStatus: "verified",
      $or: [
        { visibility: "public" },
        { visibility: "private", ownerId: userId },
      ],
    })
      .select("name visibility")
      .sort({ visibility: 1, name: 1 })
      .lean();

    return NextResponse.json(domains);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
