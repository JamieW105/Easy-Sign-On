import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { loadRoOverrideSettings } from "@/lib/server/roOverride";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadRoOverrideSettings();
  return {
    title: `${settings.clubName} | Easy Sign On`,
    description: `Race-day sign-on and sign-off for ${settings.clubName}.`,
    icons: { icon: "/api/club-settings/icon" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await loadRoOverrideSettings();
  return (
    <html
      lang={settings.language}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
