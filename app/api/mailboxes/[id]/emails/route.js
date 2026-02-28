import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";

// GET /api/mailboxes/[id]/emails – list emails for a mailbox
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;
    const userId = session.user.id;

    // User must be owner or in sharedWith
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
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30", 10), 1), 100);
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      IncomingEmail.find({ mailboxId: id })
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-attachments.content")
        .lean(),
      IncomingEmail.countDocuments({ mailboxId: id }),
    ]);

    return NextResponse.json({ emails, total, page, limit });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
