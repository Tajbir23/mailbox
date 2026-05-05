import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Domain from "@/lib/models/Domain";
import { getAuthUser, apiHandler } from "@/lib/api-auth";

export const GET = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const domain = await Domain.findOne({ _id: params.id, ownerId: auth.id }).lean();
  if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  return NextResponse.json(domain);
});

export const PATCH = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await request.json().catch(() => ({}));
  const domain = await Domain.findOne({ _id: params.id, ownerId: auth.id });
  if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  if (typeof body.visibility === "string") {
    if (!["public", "private"].includes(body.visibility)) {
      return NextResponse.json({ error: "visibility must be public or private" }, { status: 400 });
    }
    if (body.visibility === "public" && domain.verificationStatus !== "verified") {
      return NextResponse.json(
        { error: "Verify the domain before making it public" },
        { status: 400 }
      );
    }
    domain.visibility = body.visibility;
  }
  await domain.save();
  return NextResponse.json(domain);
});

export const DELETE = apiHandler(async (request, { params }) => {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const domain = await Domain.findOne({ _id: params.id, ownerId: auth.id });
  if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  await Domain.findByIdAndDelete(params.id);
  return NextResponse.json({ success: true, message: "Domain deleted" });
});
