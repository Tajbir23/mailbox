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

    const visibleQuery = { mailboxId: id, deletedFor: { $ne: userId } };
    const [emails, total] = await Promise.all([
      IncomingEmail.find(visibleQuery)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-attachments.content -deletedFor")
        .lean(),
      IncomingEmail.countDocuments(visibleQuery),
    ]);

    return NextResponse.json({ emails, total, page, limit });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/mailboxes/[id]/emails?emailId=... – hide email from caller's history.
// The document is preserved so other shared users keep seeing it.
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const emailId = searchParams.get("emailId");
    if (!emailId) {
      return NextResponse.json({ error: "emailId is required" }, { status: 400 });
    }

    // User must be owner or in sharedWith to clear from their own history
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

    const result = await IncomingEmail.updateOne(
      { _id: emailId, mailboxId: id },
      { $addToSet: { deletedFor: userId } }
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
