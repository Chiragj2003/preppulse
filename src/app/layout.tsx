import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import "./globals.css";

/**
 * Display: Bricolage Grotesque. A variable editorial grotesk with a real
 * optical-size axis, so large type is drawn tighter and small type looser
 * rather than one outline being scaled. This is the voice of the product.
 *
 * Body/UI: Geist. Neutral and highly legible, deliberately quieter than the
 * display face so the two never compete.
 *
 * Mono: Geist Mono. Timers, scores, counts, metadata.
 */
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "PrepPulse — speak better, one topic a day",
    template: "%s — PrepPulse",
  },
  description:
    "Roll a topic you didn't see coming. Talk for two minutes. Find out exactly where you landed it, where you rambled, and where you filled.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The font variables must live on <html>, not <body>. Tailwind's @theme
  // declares --font-sans/--font-display on :root, and a custom property is
  // substituted where it is *declared*, not where it is used — so with the
  // variables on <body>, var(--font-geist-sans) is undefined at :root, the
  // whole --font-sans becomes invalid, and every font-family silently falls
  // back to preflight's system stack.
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="atmosphere grain min-h-dvh">
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
