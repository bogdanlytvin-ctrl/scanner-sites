import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Lead Finder — Site Scanner & Lead Generator",
  description: "Find business leads via OpenStreetMap. Analyze websites, score leads (HOT/WARM/COLD), export to Excel & CSV.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" suppressHydrationWarning translate="no">
      <body
        className="antialiased bg-background text-foreground"
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
