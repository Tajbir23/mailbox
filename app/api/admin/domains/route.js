import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";

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

    const exists = await Domain.findOne({ name: name.toLowerCase() });
    if (exists) {
      return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
    }

    const domain = await Domain.create({
      name: name.toLowerCase(),
      visibility: visibility || "public",
      ownerId: session.user.id,
      verificationStatus: "verified",
      verifiedAt: new Date(),
      dnsRecords: { mxVerified: true, txtVerified: true },
    });
    return NextResponse.json(domain, { status: 201 });
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

// PATCH /api/admin/domains – toggle active status
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { id, isActive } = await request.json();

    const domain = await Domain.findByIdAndUpdate(id, { isActive }, { new: true });
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    return NextResponse.json(domain);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
