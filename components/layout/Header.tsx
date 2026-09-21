import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { primaryNavLinks } from "@/lib/navigation";
import { MobileNav } from "@/components/layout/MobileNav";

export function Header() {
  return (
    <header className="relative border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="rounded-sm"
          aria-label="Fertig Haus Partner – zur Startseite"
        >
          <Wordmark />
        </Link>

        <nav
          aria-label="Hauptnavigation"
          className="hidden items-center gap-8 sm:flex"
        >
          <ul className="flex items-center gap-8">
            {primaryNavLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-charcoal-700 transition-colors hover:text-olive-700"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Button href="/partner-werden" variant="primary" className="ml-2">
            Partner werden
          </Button>
        </nav>

        <MobileNav links={primaryNavLinks} />
      </div>
    </header>
  );
}
