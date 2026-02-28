import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

const MAIL_HOSTNAME = process.env.MAIL_SERVER_HOSTNAME || "mail.yourdomain.com";

// POST /api/user/domains/[id]/verify — verify DNS records for a domain
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;

    const domain = await Domain.findOne({
      _id: id,
      ownerId: session.user.id,
    });

    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found or you don't have permission" },
        { status: 404 }
      );
    }

    const results = {
      mxVerified: false,
      txtVerified: false,
      mxDetails: null,
      txtDetails: null,
      errors: [],
    };

    // ---- Check MX Record ----
    try {
      const mxRecords = await resolveMx(domain.name);
      // Check if any MX record points to our mail server
      const found = mxRecords.some(
        (r) =>
          r.exchange.toLowerCase() === MAIL_HOSTNAME.toLowerCase() ||
          r.exchange.toLowerCase() === `${MAIL_HOSTNAME.toLowerCase()}.`
      );
      results.mxVerified = found;
      results.mxDetails = mxRecords.map((r) => `${r.priority} ${r.exchange}`);
      if (!found) {
        results.errors.push(
          `MX record not found. Expected: ${MAIL_HOSTNAME}`
        );
      }
    } catch (err) {
      results.errors.push(`MX lookup failed: ${err.code || err.message}`);
    }

    // ---- Check TXT Verification Record ----
    try {
      const txtRecords = await resolveTxt(domain.name);
      const flatRecords = txtRecords.map((r) => r.join(""));
      const expectedTxt = `mailbox-verify=${domain.verificationToken}`;
      const found = flatRecords.some((r) => r === expectedTxt);
      results.txtVerified = found;
      results.txtDetails = flatRecords;
      if (!found) {
        results.errors.push(
          `TXT verification record not found. Expected: ${expectedTxt}`
        );
      }
    } catch (err) {
      results.errors.push(`TXT lookup failed: ${err.code || err.message}`);
    }

    // ---- Update domain status ----
    domain.dnsRecords.mxVerified = results.mxVerified;
    domain.dnsRecords.txtVerified = results.txtVerified;

    if (results.mxVerified && results.txtVerified) {
      domain.verificationStatus = "verified";
      domain.verifiedAt = new Date();
    } else {
      domain.verificationStatus = "failed";
    }

    await domain.save();

    return NextResponse.json({
      verificationStatus: domain.verificationStatus,
      dnsRecords: domain.dnsRecords,
      results,
    });
  } catch (err) {
    console.error("Verification error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET /api/user/domains/[id]/verify — get current verification status & required records
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;

    const domain = await Domain.findOne({
      _id: id,
      ownerId: session.user.id,
    });

    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      domain: domain.name,
      verificationStatus: domain.verificationStatus,
      dnsRecords: domain.dnsRecords,
      requiredRecords: {
        mx: {
          type: "MX",
          host: domain.name,
          value: MAIL_HOSTNAME,
          priority: 10,
          description: "Points your domain's email to our mail server",
        },
        txt: {
          type: "TXT",
          host: domain.name,
          value: `mailbox-verify=${domain.verificationToken}`,
          description: "Proves you own this domain",
        },
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
