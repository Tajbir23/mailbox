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

  // Allow our primary system domains by default
  const mainDomains = ['genuinesoftmart.store', 'www.genuinesoftmart.store'];
  if (mainDomains.includes(domain)) {
    return new NextResponse(null, { status: 200 });
  }

  try {
    await dbConnect();
    // Check if the domain is registered, active, and approved for website hosting by admin
    const existingDomain = await Domain.findOne({ 
      name: domain.toLowerCase(), 
      isActive: true,
      isWebsiteApproved: true 
    });
    
    if (existingDomain) {
      // Return 200 OK to tell Caddy to issue an SSL certificate
      return new NextResponse(null, { status: 200 });
    }
    
    // Return 404 (or 403) so Caddy denies SSL issuance for unknown domains
    return new NextResponse(null, { status: 404 });
  } catch (error) {
    console.error("verify-domain error:", error);
    return new NextResponse(null, { status: 500 });
  }
}
