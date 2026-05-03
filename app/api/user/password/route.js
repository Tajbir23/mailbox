import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import { rateLimit } from "@/lib/rate-limit";

// 5 password change attempts per IP per 15 minutes
const limiter = rateLimit({ interval: 15 * 60 * 1000, uniqueTokenPerInterval: 500 });

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";
    try {
      await limiter.check(5, `pwchange_${ip}`);
    } catch {
      return NextResponse.json(
        { error: "Too many password change attempts. Try again later." },
        { status: 429 }
      );
    }

    await dbConnect();
    const body = await request.json();

    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;

    if (!currentPassword || !newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "Current and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6 || newPassword.length > 128) {
      return NextResponse.json(
        { error: "New password must be between 6 and 128 characters" },
        { status: 400 }
      );
    }

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const sameAsOld = await bcrypt.compare(newPassword, user.password);
    if (sameAsOld) {
      return NextResponse.json(
        { error: "New password must be different from the current password" },
        { status: 400 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    await user.save();

    return NextResponse.json({ message: "Password updated" });
  } catch (err) {
    console.error("Password change error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
