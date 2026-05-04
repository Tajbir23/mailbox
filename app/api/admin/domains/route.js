import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import Notification from "@/lib/models/Notification";

// GET /api/admin/domains – list all domains (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const domains = await Domain.find()
      .populate("ownerId", "name email")
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json(domains);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/admin/domains – add a new domain (public or private)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { name, visibility } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Domain name is required" }, { status: 400 });
    }

    const domainName = name.toLowerCase().trim();
    if (!/^[a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,}$/.test(domainName)) {
      return NextResponse.json(
        { error: "Invalid domain format (e.g. mydomain.com)" },
        { status: 400 }
      );
    }

    const exists = await Domain.findOne({ name: domainName });
    if (exists) {
      return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
    }

    try {
      const domain = await Domain.create({
        name: domainName,
        visibility: visibility || "public",
        ownerId: session.user.id,
        isSystemDomain: true,
        verificationStatus: "verified",
        websiteStatus: "approved",
        verifiedAt: new Date(),
        dnsRecords: { mxVerified: true, txtVerified: true },
      });
      return NextResponse.json(domain, { status: 201 });
    } catch (err) {
      if (err && err.code === 11000) {
        return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/admin/domains?id=xxx – remove a domain
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Domain id is required" }, { status: 400 });
    }

    await Domain.findByIdAndDelete(id);
    return NextResponse.json({ message: "Domain deleted" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/admin/domains – toggle active status or visibility
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await request.json();
    const { id } = body;

    const update = {};
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    
    if (body.websiteStatus) {
      update.websiteStatus = body.websiteStatus;
      
      // We need to fetch the domain first to check if status actually changed
      const currentDomain = await Domain.findById(id);
      if (currentDomain && currentDomain.websiteStatus !== body.websiteStatus) {
        if (body.websiteStatus === "approved") {
          await Notification.create({
            userId: currentDomain.ownerId,
            title: "Website Hosting Approved! 🎉",
            message: `Your request to host your website on ${currentDomain.name} has been approved! Open the setup guide to configure your DNS.`,
            type: "success",
            link: `/dashboard/domains/${currentDomain._id}/hosting`
          });
        } else if (body.websiteStatus === "rejected") {
          await Notification.create({
            userId: currentDomain.ownerId,
            title: "Website Hosting Rejected",
            message: `Your request to host your website on ${currentDomain.name} was not approved by the admin.`,
            type: "error",
            link: "/dashboard"
          });
        }
      }
    }

    if (body.visibility === "public" || body.visibility === "private") update.visibility = body.visibility;
    if (body.verificationStatus) {
      update.verificationStatus = body.verificationStatus;
      if (body.verificationStatus === "verified") {
        update.verifiedAt = new Date();
        update.dnsRecords = { mxVerified: true, txtVerified: true };
      }
    }

    if (!id || Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const domain = await Domain.findByIdAndUpdate(id, update, { new: true });
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    return NextResponse.json(domain);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
