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

   `className="dark"` on <html> is what selects the theme's .dark palette. The
   product is designed dark; there is no light mode toggle yet.
   ============================================================================ */

import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif, Space_Mono } from "next/font/google";
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

// Display face for the landing page only. DM Sans is the theme's body font and
// stays exactly as TweakCN set it; this sits alongside rather than replacing it.
//
// A high-contrast editorial serif, not another heavy geometric sans. The huge
// tight bold sans is the single most recognisable tell of a generated landing
// page, and this product is about evidence and receipts — a dossier, not a
// startup deck. The serif earns that; it also gives us a real italic to accent
// with instead of putting a gradient on every heading.
const fontDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const fontMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "TubePulse — evidence-backed creator intelligence",
    template: "%s",
  },
  description:
    "Competitor research with the receipts attached: real video performance, outliers scored against a channel's own median, and ideas that cite the videos behind them.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} ${fontDisplay.variable} bg-background text-foreground flex min-h-full flex-col font-sans antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
