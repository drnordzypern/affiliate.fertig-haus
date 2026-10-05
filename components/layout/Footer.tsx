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
    <footer className="bg-olive-700 text-white">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-4 pt-16 pb-12 md:grid-cols-2 md:px-6 lg:grid-cols-[2fr_1fr_1fr] lg:gap-12">
        <div className="max-w-sm">
          <div className="inline-block rounded-lg bg-white px-4 py-3">
            <Wordmark size="footer" />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-white/70">
            Der Partnerbereich von{" "}
            <span className="text-white">fertig-haus.net</span> für
            Empfehlungspartnerinnen und -partner.
          </p>
        </div>

        <nav aria-label="Fußzeilennavigation" className="flex flex-col gap-5">
          <p className="text-lg font-semibold text-white">
            Navigation
          </p>
          <ul className="flex flex-col gap-2">
            {primaryNavLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-white/70 transition-colors hover:text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {availableLegalEntries.length > 0 && (
          <div className="flex flex-col gap-5">
            <p className="text-lg font-semibold text-white">
              Rechtliches
            </p>
            <ul className="flex flex-col gap-2">
              {availableLegalEntries.map((entry) => (
                <li key={entry.label}>
                  <Link
                    href={entry.href as string}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-[1240px] px-4 md:px-6">
        <div className="flex border-t border-white/10 py-8 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/70">
            © {new Date().getFullYear()} Fertig Haus Partner Portal.
          </p>
          <LockAccessButton />
        </div>
      </div>
    </footer>
  );
}
