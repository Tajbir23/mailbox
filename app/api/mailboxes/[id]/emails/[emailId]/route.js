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

function normalizeTags(input) {
  if (!Array.isArray(input)) return null;
  const cleaned = input
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .map((t) => t.slice(0, 40));
  return Array.from(new Set(cleaned)).slice(0, 20);
}

// PATCH /api/mailboxes/[id]/emails/[emailId]
//   Body: { action: "setTags", tags: string[] }
export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const { id, emailId } = params;
    const userId = session.user.id;

    const ctx = await getAuthorizedEmail(emailId, id, userId);
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await request.json().catch(() => ({}));

    if (body.action === "setTags") {
      const tags = normalizeTags(body.tags);
      if (tags === null) {
        return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
      }
      ctx.email.tags = tags;
      await ctx.email.save();
      return NextResponse.json({ success: true, tags: ctx.email.tags });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
