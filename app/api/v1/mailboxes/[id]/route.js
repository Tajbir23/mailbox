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
  })
    .populate("domainId", "name")
    .populate("ownerId", "name email")
    .lean();
  if (!mailbox) {
    return NextResponse.json({ error: "Mailbox not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({
    id: mailbox._id.toString(),
    emailAddress: mailbox.emailAddress,
    domain: mailbox.domainId?.name,
    owner: mailbox.ownerId,
    isOwner: mailbox.ownerId._id.toString() === auth.id,
    isPublic: mailbox.isPublic,
    tags: mailbox.tags || [],
    expiresAt: mailbox.expiresAt,
    createdAt: mailbox.createdAt,
  });
});

export const PATCH = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await request.json().catch(() => ({}));
  const mailbox = await Mailbox.findOne({ _id: params.id, ownerId: auth.id });
  if (!mailbox) {
    return NextResponse.json(
      { error: "Mailbox not found or you are not the owner" },
      { status: 404 }
    );
  }

  if (typeof body.isPublic === "boolean") mailbox.isPublic = body.isPublic;

  if ("expiresAt" in body) {
    if (body.expiresAt === null) {
      mailbox.expiresAt = null;
    } else {
      const d = new Date(body.expiresAt);
      if (isNaN(d.getTime()) || d <= new Date()) {
        return NextResponse.json({ error: "expiresAt must be a future date" }, { status: 400 });
      }
      mailbox.expiresAt = d;
    }
  }

  if (Array.isArray(body.tags)) {
    const cleaned = body.tags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean)
      .map((t) => t.slice(0, 40));
    mailbox.tags = Array.from(new Set(cleaned)).slice(0, 30);
  }

  await mailbox.save();
  return NextResponse.json({
    id: mailbox._id.toString(),
    isPublic: mailbox.isPublic,
    expiresAt: mailbox.expiresAt,
    tags: mailbox.tags,
  });
});

export const DELETE = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const mailbox = await Mailbox.findOne({ _id: params.id, ownerId: auth.id });
  if (!mailbox) {
    return NextResponse.json(
      { error: "Mailbox not found or you are not the owner" },
      { status: 404 }
    );
  }

  await IncomingEmail.deleteMany({ mailboxId: params.id });
  await Mailbox.deleteOne({ _id: params.id });
  return NextResponse.json({ success: true, message: "Mailbox and all emails deleted" });
});
