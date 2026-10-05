import type { Metadata, Viewport } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fertig Haus Partner Portal",
    template: "%s · Fertig Haus Partner Portal",
  },
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
