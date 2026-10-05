import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { primaryNavLinks } from "@/lib/navigation";
import { MobileNav } from "@/components/layout/MobileNav";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 md:px-6 lg:h-20">
        <Link
          href="/"
          className="rounded-lg"
          aria-label="Fertig Haus Partner – zur Startseite"
        >
          <Wordmark decorative />
        </Link>

        <nav
          aria-label="Hauptnavigation"
          className="hidden items-center gap-8 lg:flex"
        >
          <ul className="flex items-center gap-8">
            {primaryNavLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-charcoal-700 transition-colors hover:text-olive-700 hover:underline hover:decoration-cta hover:decoration-2 hover:underline-offset-8"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Button href="/partner-werden" variant="cta" className="ml-2 h-11">
            Partner werden
          </Button>
        </nav>

        <MobileNav links={primaryNavLinks} />
      </div>
    </header>
  );
}
