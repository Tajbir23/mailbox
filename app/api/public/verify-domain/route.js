import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Domain from '@/lib/models/Domain';

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');

  if (!domain) {
    return NextResponse.json({ error: 'Missing domain' }, { status: 400 });
  }

  const requested = domain.toLowerCase().trim();

  // Allow our primary system domains by default
  const mainDomains = ['genuinesoftmart.store', 'www.genuinesoftmart.store'];
  if (mainDomains.includes(requested)) {
    return new NextResponse(null, { status: 200 });
  }

  // Also consider the apex form when the request is for a www. host
  const apex = requested.startsWith('www.') ? requested.slice(4) : requested;
  const candidates = [...new Set([requested, apex, `www.${apex}`])];

  try {
    await dbConnect();

    // Auto-SSL eligibility: a domain gets a certificate as soon as it is
    // registered, active, and DNS-verified (MX/TXT) by its owner — no separate
    // admin hosting approval required. Admin-approved hosting domains also
    // qualify. Requiring DNS verification prevents Let's Encrypt rate-limit
    // abuse from arbitrary/unverified hostnames.
    const existingDomain = await Domain.findOne({
      name: { $in: candidates },
      isActive: true,
      $or: [
        { verificationStatus: "verified" },
        { websiteStatus: "approved" },
      ],
    });

    if (existingDomain) {
      // Return 200 OK to tell Caddy to issue an SSL certificate
      return new NextResponse(null, { status: 200 });
    }

    // Return 404 so Caddy denies SSL issuance for unknown/unverified domains
    return new NextResponse(null, { status: 404 });
  } catch (error) {
    console.error("verify-domain error:", error);
    return new NextResponse(null, { status: 500 });
  }
}
