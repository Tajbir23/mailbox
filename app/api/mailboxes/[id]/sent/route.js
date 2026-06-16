import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import SentEmail from "@/lib/models/SentEmail";
import { clampLimit, buildSentFilter, buildSentSort } from "@/lib/sent-query";

// GET /api/mailboxes/[id]/sent – list sent emails for a mailbox (Req 8.2–8.5)
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;
    const userId = session.user.id;

    // User must be owner or in sharedWith (Req 8.3 – no records on denial)
    const mailbox = await Mailbox.findOne({
      _id: id,
      $or: [{ ownerId: userId }, { sharedWith: userId }],
    }).lean();
    if (!mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found or access denied" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = clampLimit(searchParams.get("limit")); // Req 8.5
    const skip = (page - 1) * limit;

    const filter = buildSentFilter(id); // Req 8.2
    const [sent, total] = await Promise.all([
      SentEmail.find(filter)
        .sort(buildSentSort()) // newest first (Req 8.4)
        .skip(skip)
        .limit(limit)
        .select("-attachments.content") // strip attachment buffers
        .lean(),
      SentEmail.countDocuments(filter),
    ]);

    return NextResponse.json({ sent, total, page, limit });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
