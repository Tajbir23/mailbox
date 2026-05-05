import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";
import { getAuthUser, apiHandler } from "@/lib/api-auth";

async function loadEmail(emailId, mailboxId, userId) {
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

function serialise(email, includeBody = true) {
  return {
    id: email._id.toString(),
    from: email.from,
    to: email.to,
    subject: email.subject,
    ...(includeBody ? { bodyText: email.bodyText, bodyHtml: email.bodyHtml } : {}),
    isRead: email.isRead,
    tags: email.tags || [],
    attachments: (email.attachments || []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
    })),
    receivedAt: email.receivedAt,
  };
}

export const GET = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const ctx = await loadEmail(params.emailId, params.id, auth.id);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  if (!ctx.email.isRead) {
    ctx.email.isRead = true;
    await ctx.email.save();
  }
  return NextResponse.json(serialise(ctx.email));
});

export const PATCH = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await request.json().catch(() => ({}));
  const ctx = await loadEmail(params.emailId, params.id, auth.id);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  if (typeof body.isRead === "boolean") ctx.email.isRead = body.isRead;
  if (Array.isArray(body.tags)) {
    const cleaned = body.tags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean)
      .map((t) => t.slice(0, 40));
    ctx.email.tags = Array.from(new Set(cleaned)).slice(0, 20);
  }
  await ctx.email.save();
  return NextResponse.json(serialise(ctx.email, false));
});

export const DELETE = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const mailbox = await Mailbox.findOne({
    _id: params.id,
    $or: [{ ownerId: auth.id }, { sharedWith: auth.id }],
  }).lean();
  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found or access denied" }, { status: 404 });
  }

  const isOwner = mailbox.ownerId.toString() === auth.id;
  if (isOwner) {
    const r = await IncomingEmail.deleteOne({
      _id: params.emailId,
      mailboxId: params.id,
    });
    if (r.deletedCount === 0) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, scope: "all" });
  }

  await IncomingEmail.updateOne(
    { _id: params.emailId, mailboxId: params.id },
    { $addToSet: { deletedFor: auth.id } }
  );
  return NextResponse.json({ success: true, scope: "self" });
});
