import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import Domain from "@/lib/models/Domain";
import { getAuthUser, apiHandler } from "@/lib/api-auth";

export const GET = apiHandler(async (request) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const mailboxes = await Mailbox.find({
    $or: [{ ownerId: auth.id }, { sharedWith: auth.id }],
  })
    .populate("domainId", "name")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json(
    mailboxes.map((mb) => ({
      id: mb._id.toString(),
      emailAddress: mb.emailAddress,
      domain: mb.domainId?.name || null,
      isOwner: mb.ownerId.toString() === auth.id,
      isPublic: mb.isPublic,
      tags: mb.tags || [],
      expiresAt: mb.expiresAt,
      createdAt: mb.createdAt,
    }))
  );
});

export const POST = apiHandler(async (request) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await request.json().catch(() => ({}));
  const { prefix, domainId, domain: domainName, isPublic } = body;

  if (!prefix || (!domainId && !domainName)) {
    return NextResponse.json(
      { error: "prefix and domainId (or domain) are required" },
      { status: 400 }
    );
  }

  const prefixClean = String(prefix).toLowerCase().trim();
  if (!/^[a-z0-9._-]+$/.test(prefixClean)) {
    return NextResponse.json(
      { error: "Prefix can only contain letters, numbers, dots, hyphens, and underscores" },
      { status: 400 }
    );
  }

  if (domainId && !mongoose.Types.ObjectId.isValid(domainId)) {
    return NextResponse.json({ error: "Invalid domainId" }, { status: 400 });
  }
  const domain = domainId
    ? await Domain.findOne({ _id: domainId, isActive: true })
    : await Domain.findOne({ name: String(domainName).toLowerCase().trim(), isActive: true });
  if (!domain) {
    return NextResponse.json({ error: "Domain not found or inactive" }, { status: 404 });
  }
  if (domain.visibility === "private" && domain.ownerId.toString() !== auth.id) {
    return NextResponse.json({ error: "You do not have access to this domain" }, { status: 403 });
  }
  if (domain.verificationStatus !== "verified") {
    return NextResponse.json(
      { error: "Domain DNS is not verified yet" },
      { status: 400 }
    );
  }

  const emailAddress = `${prefixClean}@${domain.name}`;
  const exists = await Mailbox.findOne({ emailAddress });
  if (exists) {
    return NextResponse.json({ error: `${emailAddress} is already taken` }, { status: 409 });
  }

  const mailbox = await Mailbox.create({
    emailAddress,
    domainId: domain._id,
    ownerId: auth.id,
    isPublic: Boolean(isPublic),
  });

  return NextResponse.json(
    {
      id: mailbox._id.toString(),
      emailAddress: mailbox.emailAddress,
      domain: domain.name,
      isPublic: mailbox.isPublic,
      createdAt: mailbox.createdAt,
    },
    { status: 201 }
  );
});
