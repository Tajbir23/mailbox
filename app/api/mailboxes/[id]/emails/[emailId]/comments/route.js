import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";

export const dynamic = "force-dynamic";

async function getAuthorizedEmail(emailId, mailboxId, userId) {
  const mailbox = await Mailbox.findOne({
    _id: mailboxId,
    $or: [{ ownerId: userId }, { sharedWith: userId }],
  }).lean();
  if (!mailbox) return { error: "Mailbox not found or access denied", status: 404 };

  const email = await IncomingEmail.findOne({
    _id: emailId,
    mailboxId,
    deletedFor: { $ne: userId },
  });
  if (!email) return { error: "Email not found", status: 404 };

  return { mailbox, email };
}

// POST /api/mailboxes/[id]/emails/[emailId]/comments
//   Body: { text: string }
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id, emailId } = params;
    const userId = session.user.id;

    const ctx = await getAuthorizedEmail(emailId, id, userId);
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Comment text required" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 });
    }

    ctx.email.comments.push({
      userId,
      userName: session.user.name || session.user.email || "User",
      text,
      createdAt: new Date(),
    });
    await ctx.email.save();

    const created = ctx.email.comments[ctx.email.comments.length - 1];
    return NextResponse.json({ success: true, comment: created });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/mailboxes/[id]/emails/[emailId]/comments?commentId=xxx
//   Comment author can always delete; mailbox owner can delete any.
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id, emailId } = params;
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get("commentId");
    if (!commentId) {
      return NextResponse.json({ error: "commentId required" }, { status: 400 });
    }

    const ctx = await getAuthorizedEmail(emailId, id, userId);
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const comment = ctx.email.comments.id(commentId);
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAuthor = comment.userId.toString() === userId;
    const isOwner = ctx.mailbox.ownerId.toString() === userId;
    if (!isAuthor && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    ctx.email.comments.pull(commentId);
    await ctx.email.save();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
