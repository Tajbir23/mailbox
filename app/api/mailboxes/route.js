import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import Domain from "@/lib/models/Domain";
import IncomingEmail from "@/lib/models/IncomingEmail";

// GET /api/mailboxes – list mailboxes where user is owner OR sharedWith
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const userId = session.user.id;

    const mailboxes = await Mailbox.find({
      $or: [{ ownerId: userId }, { sharedWith: userId }],
    })
      .populate("domainId", "name")
      .populate("ownerId", "name email")
      .populate("sharedWith", "name email")
      .sort({ createdAt: -1 })
      .lean();

    // Fetch last email and unread count for each mailbox
    const mailboxIds = mailboxes.map((mb) => mb._id);

    const [lastEmails, unreadCounts] = await Promise.all([
      // Get last email per mailbox using aggregation
      IncomingEmail.aggregate([
        { $match: { mailboxId: { $in: mailboxIds } } },
        { $sort: { receivedAt: -1 } },
        {
          $group: {
            _id: "$mailboxId",
            lastEmail: {
              $first: {
                _id: "$_id",
                from: "$from",
                subject: "$subject",
                receivedAt: "$receivedAt",
                isRead: "$isRead",
              },
            },
          },
        },
      ]),
      // Get unread count per mailbox
      IncomingEmail.aggregate([
        { $match: { mailboxId: { $in: mailboxIds }, isRead: false } },
        { $group: { _id: "$mailboxId", count: { $sum: 1 } } },
      ]),
    ]);

    // Build lookup maps
    const lastEmailMap = {};
    for (const item of lastEmails) {
      lastEmailMap[item._id.toString()] = item.lastEmail;
    }
    const unreadMap = {};
    for (const item of unreadCounts) {
      unreadMap[item._id.toString()] = item.count;
    }

    // Attach to mailboxes
    const enriched = mailboxes.map((mb) => ({
      ...mb,
      lastEmail: lastEmailMap[mb._id.toString()] || null,
      unreadCount: unreadMap[mb._id.toString()] || 0,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/mailboxes – create a new mailbox
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { prefix, domainId } = await request.json();

    if (!prefix || !domainId) {
      return NextResponse.json(
        { error: "Prefix and domainId are required" },
        { status: 400 }
      );
    }

    // Validate prefix format
    const prefixClean = prefix.toLowerCase().trim();
    if (!/^[a-z0-9._-]+$/.test(prefixClean)) {
      return NextResponse.json(
        { error: "Prefix can only contain letters, numbers, dots, hyphens, and underscores" },
        { status: 400 }
      );
    }

    // Check domain exists, is active, and user has access
    const domain = await Domain.findOne({ _id: domainId, isActive: true });
    if (!domain) {
      return NextResponse.json({ error: "Domain not found or inactive" }, { status: 404 });
    }

    // Verify access: public domains are open to all, private only to owner
    if (domain.visibility === "private" && domain.ownerId.toString() !== session.user.id) {
      return NextResponse.json({ error: "You do not have access to this domain" }, { status: 403 });
    }

    const emailAddress = `${prefixClean}@${domain.name}`;

    // Check uniqueness
    const exists = await Mailbox.findOne({ emailAddress });
    if (exists) {
      return NextResponse.json(
        { error: `${emailAddress} is already taken` },
        { status: 409 }
      );
    }

    const mailbox = await Mailbox.create({
      emailAddress,
      domainId: domain._id,
      ownerId: session.user.id,
    });

    const populated = await Mailbox.findById(mailbox._id)
      .populate("domainId", "name")
      .populate("ownerId", "name email");

    return NextResponse.json(populated, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
