import type { Metadata } from "next";
import { Be_Vietnam_Pro, Source_Serif_4, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
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

export const metadata: Metadata = {
  title: "TalScout — Stop typing résumés. Start finding talent.",
  description:
    "Transform chaotic PDFs into a structured, searchable candidate database in seconds. Built for high-volume recruitment teams who demand precision and speed.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${beVietnam.variable} ${sourceSerif.variable} ${geistMono.variable} scroll-smooth antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-dvh bg-bg-cream text-on-surface">
        {children}
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
