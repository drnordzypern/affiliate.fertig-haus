import type { Metadata, Viewport } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fertig-Haus Affiliate System",
    template: "%s · Fertig-Haus Affiliate System",
  },
  applicationName: "Fertig-Haus Affiliate System",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Home-screen name only; no standalone mode, service worker or offline cache.
  appleWebApp: { title: "Fertig-Haus Affiliate" },
  description:
    "Partnerportal von Fertig Haus für Empfehlungspartnerinnen und -partner. Der Zugang erfolgt ausschließlich über eine persönliche Einladung.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a3a5b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-stone-50 font-sans text-charcoal-900">
        <a
          href="#main-content"
          className="skip-link rounded-lg bg-olive-700 px-4 py-2 text-sm font-medium text-white"
        >
          Zum Inhalt springen
        </a>
        <Header />
        <main id="main-content" className="flex flex-1 flex-col">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
