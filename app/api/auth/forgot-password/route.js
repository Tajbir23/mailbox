import { NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeEmail } from "@/lib/sanitize";

// 5 requests per IP per 15 minutes
const limiter = rateLimit({ interval: 15 * 60 * 1000, uniqueTokenPerInterval: 500 });

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";
    try {
      await limiter.check(5, `forgot_${ip}`);
    } catch {
      return NextResponse.json(
        { error: "Too many reset requests. Try again later." },
        { status: 429 }
      );
    }

    await dbConnect();
    const body = await request.json();
    const email = sanitizeEmail(body.email);

    // Always return the same response to avoid leaking which emails exist
    const genericResponse = NextResponse.json({
      message: "If an account exists for this email, a reset link has been sent.",
    });

    if (!email) return genericResponse;

    const user = await User.findOne({ email });
    if (!user) return genericResponse;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetTokenHash = tokenHash;
    user.resetTokenExpiry = new Date(Date.now() + RESET_TTL_MS);
    await user.save();

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      `${request.headers.get("x-forwarded-proto") || "http"}://${request.headers.get("host")}`;
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    // No outbound email service is wired up yet — log the reset URL so the
    // operator can deliver it manually. Replace this with a real mailer
    // (nodemailer / Resend / SES) when available.
    console.log("\n=== PASSWORD RESET LINK ===");
    console.log(`for ${email}`);
    console.log(resetUrl);
    console.log("expires:", user.resetTokenExpiry.toISOString());
    console.log("===========================\n");

    return genericResponse;
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
