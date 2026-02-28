import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";

// GET /api/user/domains – list all domains owned by the user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const domains = await Domain.find({
      ownerId: session.user.id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(domains);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/user/domains – user adds their own domain (starts as private, pending verification)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Domain name is required" }, { status: 400 });
    }

    // Validate domain format
    const domainName = name.toLowerCase().trim();
    if (!/^[a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,}$/.test(domainName)) {
      return NextResponse.json(
        { error: "Invalid domain format (e.g. mydomain.com)" },
        { status: 400 }
      );
    }

    // Check uniqueness across all domains
    const exists = await Domain.findOne({ name: domainName });
    if (exists) {
      return NextResponse.json({ error: "This domain is already registered" }, { status: 409 });
    }

    const domain = await Domain.create({
      name: domainName,
      visibility: "private",
      ownerId: session.user.id,
      verificationStatus: "pending",
    });

    return NextResponse.json(domain, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/user/domains – toggle visibility (public/private) for own domain
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id, visibility } = await request.json();

    if (!id || !["public", "private"].includes(visibility)) {
      return NextResponse.json(
        { error: "Valid id and visibility (public/private) are required" },
        { status: 400 }
      );
    }

    const domain = await Domain.findOne({ _id: id, ownerId: session.user.id });
    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Only verified domains can be made public
    if (visibility === "public" && domain.verificationStatus !== "verified") {
      return NextResponse.json(
        { error: "Domain must be verified before making it public" },
        { status: 400 }
      );
    }

    domain.visibility = visibility;
    await domain.save();

    return NextResponse.json(domain);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/user/domains?id=xxx – user deletes their own domain
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Domain id is required" }, { status: 400 });
    }

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

    await Domain.findByIdAndDelete(id);
    return NextResponse.json({ message: "Domain deleted" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
