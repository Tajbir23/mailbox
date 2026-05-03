import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 1000 });

// GET /api/public/mailbox/[id]/emails – list emails for a publicly-shared mailbox
export async function GET(request, { params }) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    try {
      await limiter.check(120, `public-emails-${ip}`);
    } catch {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await dbConnect();
    const { id } = params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid mailbox id" }, { status: 400 });
    }

    const mailbox = await Mailbox.findOne({
      _id: id,
      isActive: true,
      isPublic: true,
    })
      .select("_id emailAddress")
      .lean();

    if (!mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found or not public" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "30", 10), 1),
      50
    );
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      IncomingEmail.find({ mailboxId: id })
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("from to subject bodyHtml bodyText receivedAt")
        .lean(),
      IncomingEmail.countDocuments({ mailboxId: id }),
    ]);

    return NextResponse.json({
      mailbox: {
        _id: mailbox._id,
        emailAddress: mailbox.emailAddress,
      },
      emails,
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
