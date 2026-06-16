import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import { buildDomainDnsRecords } from "@/lib/dns-records";

const HOSTING_IP =
  process.env.HOSTING_SERVER_IP || process.env.SERVER_PUBLIC_IP || "";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;

    const domain = await Domain.findOne({ _id: id, ownerId: session.user.id }).lean();
    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Comprehensive, grouped DNS guide (ownership + sending + hosting + PTR).
    const setup = buildDomainDnsRecords(domain);

    return NextResponse.json({
      domain: domain.name,
      verificationStatus: domain.verificationStatus,
      websiteStatus: domain.websiteStatus,
      approved: setup.approved,
      hostingIp: setup.serverIp || HOSTING_IP,
      mailHostname: setup.mailHostname,
      dkimConfigured: setup.dkimConfigured,
      // Full grouped guide with per-record purpose + where-to-add instructions.
      setup,
      // Backward-compatible flat A-record list (legacy clients).
      records: (setup.groups.find((g) => g.id === "hosting")?.records || []).map((r) => ({
        type: r.type,
        host: r.host,
        value: r.value,
        ttl: r.ttl,
        description: r.purpose,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;

    const domain = await Domain.findOne({ _id: id, ownerId: session.user.id });
    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Must be verified first
    if (domain.verificationStatus !== "verified") {
      return NextResponse.json(
        { error: "Domain must be verified first before requesting hosting" },
        { status: 400 }
      );
    }

    // Set to pending and make the domain public for mail creation
    domain.websiteStatus = "pending";
    domain.visibility = "public";
    await domain.save();

    return NextResponse.json({ 
      message: "Hosting requested and domain is now public",
      websiteStatus: domain.websiteStatus,
      visibility: domain.visibility
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
