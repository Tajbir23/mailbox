import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 1000 });

// GET /api/public/mailbox?email=foo@bar.com – verify a mailbox exists and is public
export async function GET(request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    try {
      await limiter.check(60, `public-mailbox-${ip}`);
    } catch {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const emailRaw = (searchParams.get("email") || "").toLowerCase().trim();

    if (!emailRaw || !/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(emailRaw)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    await dbConnect();

    const mailbox = await Mailbox.findOne({
      emailAddress: emailRaw,
      isActive: true,
      isPublic: true,
    })
      .select("_id emailAddress")
      .lean();

    if (!mailbox) {
      return NextResponse.json(
        { error: "No public mailbox found for this address" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      _id: mailbox._id,
      emailAddress: mailbox.emailAddress,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
