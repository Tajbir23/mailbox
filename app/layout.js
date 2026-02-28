import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

// ── Comprehensive SEO Metadata ──
const APP_NAME = "MailboxSaaS";
const APP_DESCRIPTION =
  "Self-hosted, receive-only email platform. Create custom mailboxes on your domains, share them with your team, and receive emails in real-time.";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: `${APP_NAME} — Self-Hosted Receive-Only Email Platform`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: [
    "email",
    "self-hosted email",
    "receive-only email",
    "custom mailbox",
    "SMTP server",
    "domain email",
    "disposable email",
    "team email",
    "real-time email",
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} — Self-Hosted Receive-Only Email Platform`,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — Self-Hosted Receive-Only Email Platform`,
    description: APP_DESCRIPTION,
  },
  alternates: {
    canonical: BASE_URL,
  },
  other: {
    "theme-color": "#4f46e5",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: APP_NAME,
    description: APP_DESCRIPTION,
    url: BASE_URL,
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-gray-50 text-gray-900 min-h-screen overflow-x-hidden antialiased">
        <Providers>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
