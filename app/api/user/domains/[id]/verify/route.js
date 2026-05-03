import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import { verifyDomainDns, MAIL_HOSTNAME } from "@/lib/dns-verify";

export const dynamic = "force-dynamic";

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

    const { results } = await verifyDomainDns(domain);

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
