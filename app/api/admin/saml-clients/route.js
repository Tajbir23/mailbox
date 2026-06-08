import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import SAMLClient from "@/lib/models/SAMLClient";

export const dynamic = "force-dynamic";

const DEFAULT_NAMEID_FORMAT =
  "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

// GET /api/admin/saml-clients – list all SAML clients
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const clients = await SAMLClient.find({})
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ clients });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/admin/saml-clients – create new SAML client
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await request.json();

    const {
      display_name,
      sp_entity_id,
      acs_urls,
      default_acs_url,
      nameid_format,
      attribute_mapping,
    } = body;

    if (!display_name) {
      return NextResponse.json(
        { error: "display_name is required" },
        { status: 400 }
      );
    }

    if (!sp_entity_id) {
      return NextResponse.json(
        { error: "sp_entity_id is required" },
        { status: 400 }
      );
    }

    if (!acs_urls || !Array.isArray(acs_urls) || acs_urls.length === 0) {
      return NextResponse.json(
        { error: "At least one acs_url is required" },
        { status: 400 }
      );
    }

    // Ensure the default ACS URL is always allow-listed
    const resolvedAcsUrls = [...acs_urls];
    if (default_acs_url && !resolvedAcsUrls.includes(default_acs_url)) {
      resolvedAcsUrls.push(default_acs_url);
    }

    const client = await SAMLClient.create({
      display_name,
      sp_entity_id,
      acs_urls: resolvedAcsUrls,
      default_acs_url: default_acs_url || null,
      nameid_format: nameid_format || DEFAULT_NAMEID_FORMAT,
      attribute_mapping: attribute_mapping || undefined,
      active: true,
    });

    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    // Handle duplicate sp_entity_id (Mongo duplicate key error)
    if (err && err.code === 11000) {
      return NextResponse.json(
        { error: "A SAML client with this sp_entity_id already exists" },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
