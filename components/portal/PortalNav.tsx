import { Badge } from "@/components/ui/Badge";
import { portalSections } from "@/lib/portal-sections";

/**
 * Navigation shell for future portal modules. Only available sections are
 * real links; unavailable ones are rendered as inert, clearly labelled
 * entries — never a clickable link to a section that doesn't exist, and
 * never framed as "coming soon" filler that dominates the page.
 */
export function PortalNav() {
  return (
    <nav
      aria-label="Portalbereiche"
      className="sm:sticky sm:top-24 sm:w-56 sm:shrink-0"
    >
      <ul className="flex flex-col gap-1 border-l border-stone-200 pl-4">
        {portalSections.map((section) =>
          section.available ? (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-sm px-2 py-1.5 text-sm text-charcoal-700 hover:text-olive-700"
              >
                {section.label}
              </a>
            </li>
          ) : (
            <li key={section.id}>
              <span
                aria-disabled="true"
                className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm text-charcoal-500"
              >
                {section.label}
                <Badge tone="neutral" className="px-2 py-0.5 text-[0.65rem]">
                  Nicht verfügbar
                </Badge>
              </span>
            </li>
          )
        )}
      </ul>
    </nav>
  );
}
