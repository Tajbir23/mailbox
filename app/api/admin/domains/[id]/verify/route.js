import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import { verifyDomainDns } from "@/lib/dns-verify";

export const dynamic = "force-dynamic";

// POST /api/admin/domains/[id]/verify — admin can verify DNS for any domain
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();
    const { id } = params;

    const domain = await Domain.findById(id);
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const { results, previousStatus, newStatus } = await verifyDomainDns(domain);

    return NextResponse.json({
      verificationStatus: domain.verificationStatus,
      dnsRecords: domain.dnsRecords,
      previousStatus,
      newStatus,
      results,
    });
  } catch (err) {
    console.error("Admin verification error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
