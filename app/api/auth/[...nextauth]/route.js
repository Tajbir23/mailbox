import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

const customHandler = async (req, ctx) => {
  // Multi-tenant check: Update NEXTAUTH_URL dynamically so sessions work on user's custom domains
  const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
  if (host) {
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    // This allows NextAuth to work flawlessly on White-label domains
    process.env.NEXTAUTH_URL = `${protocol}://${host}`;
  }
  
  return handler(req, ctx);
};

export { customHandler as GET, customHandler as POST };
