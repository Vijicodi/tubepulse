/* ============================================================================
   layout.tsx — THE ROOT LAYOUT

   Wraps every page. This is the second file your TweakCN theme touches: it
   loads the fonts the theme asks for (DM Sans + Space Mono) and exposes them
   as the CSS variables index.css reads.

   Two notes on the snippet TweakCN hands you:

   1. It imports DM_Sans twice (once for sans, once for serif), which TypeScript
      rejects as a duplicate identifier. Imported once, used twice — same result.
   2. It imports "./globals.css". This project uses index.css instead, so that
      the theme lives in one obviously-named file.

   The font variables go on <body>, not <html>, deliberately: <body> is a
   descendant of :root, so its values shadow the placeholder font names in the
   theme's :root block no matter what order the stylesheets load in.
   ============================================================================ */

import type { Metadata } from "next";
import { DM_Sans, Space_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontSerif = DM_Sans({
  subsets: ["latin"],
  variable: "--font-serif",
});

const fontMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "YT Growth — competitor research and idea generation",
  description:
    "Paste a competitor's YouTube channel. Get their real video performance, enriched with web context, turned into ranked video ideas with the evidence attached.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} bg-background text-foreground flex min-h-full flex-col font-sans antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
