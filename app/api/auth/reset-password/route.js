import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeEmail } from "@/lib/sanitize";

// 10 reset attempts per IP per 15 minutes
const limiter = rateLimit({ interval: 15 * 60 * 1000, uniqueTokenPerInterval: 500 });

export async function POST(request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";
    try {
      await limiter.check(10, `reset_${ip}`);
    } catch {
      return NextResponse.json(
        { error: "Too many reset attempts. Try again later." },
        { status: 429 }
      );
    }

    await dbConnect();
    const body = await request.json();

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const email = sanitizeEmail(body.email);
    const newPassword = body.newPassword;

    if (!token || !email || !newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "Token, email, and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6 || newPassword.length > 128) {
      return NextResponse.json(
        { error: "Password must be between 6 and 128 characters" },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({ email }).select(
      "+resetTokenHash +resetTokenExpiry"
    );
    if (!user || !user.resetTokenHash || !user.resetTokenExpiry) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    if (user.resetTokenExpiry.getTime() < Date.now()) {
      user.resetTokenHash = null;
      user.resetTokenExpiry = null;
      await user.save();
      return NextResponse.json(
        { error: "Reset link has expired. Request a new one." },
        { status: 400 }
      );
    }

    // Constant-time comparison to avoid timing attacks
    const expected = Buffer.from(user.resetTokenHash, "hex");
    const provided = Buffer.from(tokenHash, "hex");
    if (
      expected.length !== provided.length ||
      !crypto.timingSafeEqual(expected, provided)
    ) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    await user.save();

    return NextResponse.json({ message: "Password has been reset. You can now sign in." });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
