import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";

// 10 profile updates per IP per 15 minutes
const limiter = rateLimit({ interval: 15 * 60 * 1000, uniqueTokenPerInterval: 500 });

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const user = await User.findById(session.user.id).select("name email role createdAt").lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
}

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
      await limiter.check(10, `profile_${ip}`);
    } catch {
      return NextResponse.json(
        { error: "Too many update attempts. Try again later." },
        { status: 429 }
      );
    }

    await dbConnect();
    const body = await request.json();

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const currentPassword = body.currentPassword;
    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json(
        { error: "Current password is required" },
        { status: 400 }
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    let updated = false;

    // Name update
    if (typeof body.name === "string") {
      const newName = sanitizeString(body.name, 100);
      if (!newName) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      if (newName !== user.name) {
        user.name = newName;
        updated = true;
      }
    }

    // Email update
    if (typeof body.email === "string") {
      const newEmail = sanitizeEmail(body.email);
      if (!newEmail) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      if (newEmail !== user.email) {
        const exists = await User.findOne({ email: newEmail, _id: { $ne: user._id } }).lean();
        if (exists) {
          return NextResponse.json(
            { error: "Another account is already using this email" },
            { status: 409 }
          );
        }
        user.email = newEmail;
        updated = true;
      }
    }

    if (!updated) {
      return NextResponse.json({ message: "No changes" });
    }

    try {
      await user.save();
    } catch (saveErr) {
      // Duplicate email — caught here when a parallel request claimed it
      // between our pre-check and the save.
      if (saveErr?.code === 11000) {
        return NextResponse.json(
          { error: "Another account is already using this email" },
          { status: 409 }
        );
      }
      throw saveErr;
    }

    return NextResponse.json({
      message: "Profile updated",
      user: { id: user._id.toString(), name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Profile update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
