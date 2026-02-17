import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SiteHeader } from "@/components/SiteHeader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Adaptive Infinite Quiz",
  description: "An adaptive quiz application with real-time leaderboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-dvh bg-background text-foreground antialiased`}>
        <ThemeProvider>
          <SiteHeader />
          {children}
          <footer className="border-t border-foreground/10 py-10">
            <div className="mx-auto w-full max-w-5xl px-6 text-sm text-foreground/60">
              Built with Next.js, Express, Postgres, Redis, and Socket.io.
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
