import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import { getAuthUser, apiHandler } from "@/lib/api-auth";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";

export const GET = apiHandler(async (request) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const user = await User.findById(auth.id).select("name email role createdAt").lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
});

export const PATCH = apiHandler(async (request) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await request.json().catch(() => ({}));
  const user = await User.findById(auth.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let updated = false;
  if (typeof body.name === "string") {
    const newName = sanitizeString(body.name, 100);
    if (!newName) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    if (newName !== user.name) {
      user.name = newName;
      updated = true;
    }
  }
  if (typeof body.email === "string") {
    // Email changes can lock the account (password resets go to the new
    // address), so require an interactive session — not an API key.
    if (auth.source === "apiKey") {
      return NextResponse.json(
        { error: "Email cannot be changed via API key. Sign in to the dashboard." },
        { status: 403 }
      );
    }
    const newEmail = sanitizeEmail(body.email);
    if (!newEmail) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
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

  if (!updated) return NextResponse.json({ message: "No changes" });

  try {
    await user.save();
  } catch (e) {
    if (e?.code === 11000) {
      return NextResponse.json(
        { error: "Another account is already using this email" },
        { status: 409 }
      );
    }
    throw e;
  }

  return NextResponse.json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  });
});
