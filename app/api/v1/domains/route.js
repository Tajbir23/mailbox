import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import { getAuthUser, apiHandler } from "@/lib/api-auth";

export const GET = apiHandler(async (request) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") || "owned";

  const query =
    scope === "available"
      ? {
          isActive: true,
          verificationStatus: "verified",
          $or: [{ visibility: "public" }, { ownerId: auth.id }],
        }
      : { ownerId: auth.id, isSystemDomain: { $ne: true } };

  const domains = await Domain.find(query).sort({ createdAt: -1 }).lean();
  return NextResponse.json(domains);
});

export const POST = apiHandler(async (request) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").toString().toLowerCase().trim();
  if (!name) return NextResponse.json({ error: "Domain name is required" }, { status: 400 });
  if (!/^[a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,}$/.test(name)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const exists = await Domain.findOne({ name });
  if (exists) {
    return NextResponse.json({ error: "This domain is already registered" }, { status: 409 });
  }

  try {
    const domain = await Domain.create({
      name,
      visibility: "private",
      ownerId: auth.id,
      verificationStatus: "pending",
    });
    return NextResponse.json(domain, { status: 201 });
  } catch (e) {
    if (e?.code === 11000) {
      return NextResponse.json({ error: "This domain is already registered" }, { status: 409 });
    }
    throw e;
  }
});
