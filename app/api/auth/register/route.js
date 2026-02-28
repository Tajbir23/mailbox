import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";

// Rate limit: 5 registrations per IP per 15 minutes
const limiter = rateLimit({ interval: 15 * 60 * 1000, uniqueTokenPerInterval: 500 });

export async function POST(request) {
  try {
    // Rate limit check
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";
    try {
      await limiter.check(5, `register_${ip}`);
    } catch {
      return NextResponse.json(
        { error: "Too many registration attempts. Try again later." },
        { status: 429 }
      );
    }

    await dbConnect();
    const body = await request.json();

    const name = sanitizeString(body.name, 100);
    const email = sanitizeEmail(body.email);
    const password = body.password;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: "Password must be between 6 and 128 characters" },
        { status: 400 }
      );
    }

    const exists = await User.findOne({ email }).lean();
    if (exists) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role: "user",
    });

    return NextResponse.json(
      { message: "Account created", userId: user._id },
      { status: 201 }
    );
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
