import type { Metadata, Viewport } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fertig Haus Partner Portal (Vorschau)",
    template: "%s · Fertig Haus Partner Portal (Vorschau)",
  },
  description:
    "Vorschau des künftigen Partnerportals von Fertig Haus für Empfehlungspartnerinnen und -partner. Noch nicht produktiv im Einsatz.",
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
  themeColor: "#faf8f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-stone-50 font-sans text-charcoal-900">
        <a
          href="#main-content"
          className="skip-link rounded-sm bg-olive-700 px-4 py-2 text-sm font-medium text-stone-50"
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
