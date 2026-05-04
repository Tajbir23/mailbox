import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Notification from "@/lib/models/Notification";

// GET /api/user/notifications - Get all user notifications
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const limit = parseInt(request.nextUrl.searchParams.get("limit")) || 20;

    const notifications = await Notification.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(notifications);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/user/notifications - Mark as read
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id, markAll } = await request.json();

    if (markAll) {
      await Notification.updateMany(
        { userId: session.user.id, isRead: false },
        { isRead: true }
      );
    } else if (id) {
      await Notification.findOneAndUpdate(
        { _id: id, userId: session.user.id },
        { isRead: true }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
