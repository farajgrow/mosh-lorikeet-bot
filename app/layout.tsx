import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { TopNav } from "./components/TopNav";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Support Concierge — concept",
  description:
    "Unofficial concept: an AI support agent for a subscription telehealth platform that follows SOPs, takes actions, and escalates safely.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
        <div className="flex h-dvh flex-col">
          <div className="bg-ink px-4 py-1.5 text-center text-xs text-white/85">
            Unofficial concept built by Faraj Abbasi. Not affiliated with Mosh. Uses mock data.
          </div>
          <TopNav />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
