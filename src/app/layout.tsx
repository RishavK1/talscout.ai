import type { Metadata } from "next";
import { headers } from "next/headers";
import { Be_Vietnam_Pro, Source_Serif_4, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://talscout.rishavkamboj.online";
const SITE_NAME = "TalScout";
const TITLE = "TalScout — Stop typing résumés. Start finding and reaching talent.";
const DESCRIPTION =
  "Transform chaotic PDFs into a structured, searchable candidate database in seconds, then bulk-fire AI-personalized outreach campaigns to win new client business or re-engage candidates. Built for staffing and recruiting teams who demand precision, speed, and growth.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — TalScout",
  },
  description: DESCRIPTION,
  keywords: [
    "resume parsing",
    "candidate database",
    "semantic search",
    "recruiting software",
    "applicant tracking",
    "AI recruiting",
    "talent search",
    "b2b lead generation",
    "cold email outreach",
    "sales outreach software",
    "business development emails",
    "bulk email outreach",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

import { AuthProvider } from "@/components/app/auth-provider";
import { ThemeProvider } from "@/components/app/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

// Nonce-based CSP (src/proxy.ts) requires every page to be dynamically
// rendered — a statically-generated page has no request to read a nonce
// from, so Next's own framework scripts would render without one and get
// blocked by the browser. The whole app is already per-user/authenticated
// beyond the handful of marketing pages, so there's little static-caching
// upside being traded away here.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${beVietnam.variable} ${sourceSerif.variable} ${geistMono.variable} scroll-smooth antialiased`}
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("talscout-theme");var d=t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`,
          }}
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-dvh bg-bg-cream text-on-surface">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            <AuthProvider>
              {children}
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
        <Analytics />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#fff",
              color: "#221a19",
              border: "1px solid rgba(44,35,34,0.10)",
              borderRadius: "12px",
              fontFamily: "var(--font-be-vietnam), system-ui, sans-serif",
            },
          }}
        />
      </body>
    </html>
  );
}
