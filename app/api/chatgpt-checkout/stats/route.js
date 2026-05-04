import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import CheckoutLog from "@/lib/models/CheckoutLog";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "admin" && !session.user.canAccessCheckout)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [total, today, uniqueUsers] = await Promise.all([
      CheckoutLog.countDocuments(),
      CheckoutLog.countDocuments({ createdAt: { $gte: startOfToday } }),
      CheckoutLog.distinct("userId").then((users) => users.length),
    ]);

    return NextResponse.json({ total, today, uniqueUsers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "admin" && !session.user.canAccessCheckout)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    await CheckoutLog.create({ userId: session.user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}