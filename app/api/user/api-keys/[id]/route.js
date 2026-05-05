import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import ApiKey from "@/lib/models/ApiKey";
import { apiHandler } from "@/lib/api-auth";

export const DELETE = apiHandler(async (_request, { params }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const { id } = params;
  const key = await ApiKey.findOne({ _id: id, userId: session.user.id });
  if (!key) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  await ApiKey.deleteOne({ _id: id });
  return NextResponse.json({ success: true, message: "API key revoked" });
});
