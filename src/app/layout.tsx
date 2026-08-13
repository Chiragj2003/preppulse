import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, Caveat } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { env } from "@/lib/env";
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
const doodle = Caveat({ variable: "--font-caveat", subsets: ["latin"], display: "swap" });

const title = "PrepPulse — speak better, one topic a day";
const description =
  "Roll a topic you didn't see coming. Talk for two minutes. Find out exactly where you landed it, where you rambled, and where you filled. Mock interviews from your own resume, group discussions and debates against AI personas.";

export const metadata: Metadata = {
  // Without a metadataBase, Next resolves every relative OG/Twitter image
  // against localhost and warns at build. It is derived, not hardcoded, so
  // preview deployments advertise themselves rather than production.
  metadataBase: new URL(env.appUrl),
  title: { default: title, template: "%s — PrepPulse" },
  description,
  applicationName: "PrepPulse",
  keywords: [
    "communication practice",
    "mock interview",
    "AI interview practice",
    "group discussion practice",
    "public speaking practice",
    "extempore",
    "debate practice",
    "resume based interview questions",
    "spoken English practice",
    "placement preparation",
  ],
  authors: [{ name: "Chirag" }],
  creator: "Chirag",
  openGraph: {
    type: "website",
    siteName: "PrepPulse",
    title,
    description,
    url: env.appUrl,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  alternates: { canonical: "/" },
  category: "education",
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
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} ${doodle.variable}`}
      suppressHydrationWarning
    >
      <body className="atmosphere grain min-h-dvh">
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
