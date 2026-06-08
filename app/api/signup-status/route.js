export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SiteSetting from "@/lib/models/SiteSetting";
import { resolveSignupEnabled } from "@/lib/settings/signupSetting";

// GET /api/signup-status – PUBLIC endpoint reporting the current signup state.
// No authentication required. Returns exactly { signup_enabled: boolean }.
export async function GET() {
  try {
    await dbConnect();

    // Query only the signup_enabled key so no other site settings are read
    // or leaked through this public endpoint (Requirement 5.2).
    const setting = await SiteSetting.findOne({ key: "signup_enabled" }).lean();

    const signup_enabled = resolveSignupEnabled(setting?.value);

    const response = { signup_enabled };

    // Defensive isolation: the response must contain exactly one key.
    // If any unexpected extra field is present, log the error and return
    // only signup_enabled (Requirement 5.3).
    const keys = Object.keys(response);
    if (keys.length !== 1 || keys[0] !== "signup_enabled") {
      console.error(
        "Signup status response contained unexpected fields:",
        keys
      );
      return NextResponse.json({ signup_enabled });
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("Signup status error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
