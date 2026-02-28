import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";

// PATCH /api/mailboxes/[id]/emails/read – mark emails as read
export async function PATCH(request, { params }) {
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

    const { emailIds } = await request.json();

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json(
        { error: "emailIds array is required" },
        { status: 400 }
      );
    }

    // Only mark emails belonging to this mailbox
    const result = await IncomingEmail.updateMany(
      { _id: { $in: emailIds }, mailboxId: id },
      { $set: { isRead: true } }
    );

    return NextResponse.json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
