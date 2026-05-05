import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";
import { getAuthUser, apiHandler } from "@/lib/api-auth";

export const GET = apiHandler(async (request, { params }) => {
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

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30", 10), 1), 100);
  const unreadOnly = searchParams.get("unread") === "true";

  const query = { mailboxId: params.id, deletedFor: { $ne: auth.id } };
  if (unreadOnly) query.isRead = false;

  const [emails, total] = await Promise.all([
    IncomingEmail.find(query)
      .sort({ receivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-attachments.content -deletedFor")
      .lean(),
    IncomingEmail.countDocuments(query),
  ]);

  return NextResponse.json({
    emails: emails.map((e) => ({
      id: e._id.toString(),
      from: e.from,
      to: e.to,
      subject: e.subject,
      bodyText: e.bodyText,
      bodyHtml: e.bodyHtml,
      isRead: e.isRead,
      tags: e.tags || [],
      attachments: (e.attachments || []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      })),
      receivedAt: e.receivedAt,
    })),
    total,
    page,
    limit,
  });
});

export const DELETE = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const { searchParams } = new URL(request.url);
  const single = searchParams.get("emailId");

  let emailIds = [];
  if (single) {
    emailIds = [single];
  } else {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.emailIds)) emailIds = body.emailIds;
  }
  emailIds = emailIds.filter(Boolean);
  if (emailIds.length === 0) {
    return NextResponse.json({ error: "emailIds is required" }, { status: 400 });
  }

  const mailbox = await Mailbox.findOne({
    _id: params.id,
    $or: [{ ownerId: auth.id }, { sharedWith: auth.id }],
  }).lean();
  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found or access denied" }, { status: 404 });
  }

  const isOwner = mailbox.ownerId.toString() === auth.id;
  if (isOwner) {
    const result = await IncomingEmail.deleteMany({
      _id: { $in: emailIds },
      mailboxId: params.id,
    });
    return NextResponse.json({ success: true, scope: "all", affected: result.deletedCount });
  }

  const result = await IncomingEmail.updateMany(
    { _id: { $in: emailIds }, mailboxId: params.id },
    { $addToSet: { deletedFor: auth.id } }
  );
  return NextResponse.json({ success: true, scope: "self", affected: result.modifiedCount });
});
