import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { primaryNavLinks } from "@/lib/navigation";
import { legalLinks } from "@/lib/legal-config";

export function Footer() {
  const legalEntries = Object.values(legalLinks);

  return (
    <footer className="border-t border-stone-200 bg-stone-100/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 sm:flex-row sm:justify-between">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-sm leading-relaxed text-charcoal-500">
            Der Partnerbereich von{" "}
            <span className="text-charcoal-700">fertig-haus.net</span> für
            Empfehlungspartnerinnen und -partner. Diese Seite befindet sich
            in der Vorschauphase.
          </p>
        </div>

        <nav aria-label="Fußzeilennavigation" className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wide text-charcoal-500 uppercase">
            Navigation
          </p>
          <ul className="flex flex-col gap-2">
            {primaryNavLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-charcoal-700 hover:text-olive-700"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wide text-charcoal-500 uppercase">
            Rechtliches
          </p>
          <ul className="flex flex-col gap-2">
            {legalEntries.map((entry) => (
              <li key={entry.label}>
                {entry.available && entry.href ? (
                  <Link
                    href={entry.href}
                    className="text-sm text-charcoal-700 hover:text-olive-700"
                  >
                    {entry.label}
                  </Link>
                ) : (
                  <span className="text-sm text-charcoal-500">
                    {entry.label}{" "}
                    <span className="italic">(folgt)</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-stone-200 px-6 py-6">
        <p className="mx-auto max-w-6xl text-xs text-charcoal-500">
          © {new Date().getFullYear()} Fertig Haus Partner Portal – Vorschau.
          Angaben zur Rechtsträgerschaft folgen mit den finalen
          Rechtstexten.
        </p>
      </div>
    </footer>
  );
}
