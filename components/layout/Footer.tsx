import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { primaryNavLinks } from "@/lib/navigation";
import { legalLinks } from "@/lib/legal-config";
import { LockAccessButton } from "@/components/site-access/LockAccessButton";

export function Footer() {
  const availableLegalEntries = Object.values(legalLinks).filter(
    (entry) => entry.available && entry.href
  );

  return (
    <footer className="border-t border-stone-200 bg-stone-100/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 sm:flex-row sm:justify-between">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-sm leading-relaxed text-charcoal-500">
            Der Partnerbereich von{" "}
            <span className="text-charcoal-700">fertig-haus.net</span> für
            Empfehlungspartnerinnen und -partner.
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

        {availableLegalEntries.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-wide text-charcoal-500 uppercase">
              Rechtliches
            </p>
            <ul className="flex flex-col gap-2">
              {availableLegalEntries.map((entry) => (
                <li key={entry.label}>
                  <Link
                    href={entry.href as string}
                    className="text-sm text-charcoal-700 hover:text-olive-700"
                  >
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-charcoal-500">
            © {new Date().getFullYear()} Fertig Haus Partner Portal.
          </p>
          <LockAccessButton />
        </div>
      </div>
    </footer>
  );
}
