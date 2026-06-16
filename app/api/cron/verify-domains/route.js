import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import { verifyDomainDns } from "@/lib/dns-verify";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

// Hourly cron job to auto-verify pending/failed domains.
//
// Usage:
//   - Set CRON_SECRET in env, e.g. CRON_SECRET=somerandomstring
//   - Trigger via:
//       curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//         https://your-host/api/cron/verify-domains
//   - Suitable for: Vercel Cron, GitHub Actions, system crontab using curl.
//
// What it does:
//   - Finds all domains with verificationStatus !== "verified"
//   - Plus already-verified domains last checked >24h ago (re-check periodically)
//   - Runs DNS verification on each, mutating in place
//   - Returns a summary { checked, verified, failed, errors }
async function handler(request) {
  // Auth: require CRON_SECRET via Authorization header (Bearer) or ?token=
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  const provided = headerToken || queryToken;

  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const domains = await Domain.find({
      isActive: true,
      // System domains are admin-added and trusted — never re-verify/downgrade them.
      isSystemDomain: { $ne: true },
      $or: [
        { verificationStatus: { $ne: "verified" } },
        { verifiedAt: { $lt: oneDayAgo } },
        { verifiedAt: null },
      ],
    });

    const summary = {
      checked: domains.length,
      verified: 0,
      failed: 0,
      stillPending: 0,
      transitions: [],
      errors: [],
    };

    for (const domain of domains) {
      try {
        const { previousStatus, newStatus } = await verifyDomainDns(domain);
        if (previousStatus !== newStatus) {
          summary.transitions.push({
            domain: domain.name,
            from: previousStatus,
            to: newStatus,
          });
        }
        if (newStatus === "verified") summary.verified += 1;
        else if (newStatus === "failed") summary.failed += 1;
        else summary.stillPending += 1;
      } catch (err) {
        summary.errors.push({ domain: domain.name, message: err.message });
      }
    }

    return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...summary });
  } catch (err) {
    console.error("Cron verify-domains error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Accept both GET (for simpler cron triggers) and POST.
export const GET = handler;
export const POST = handler;
