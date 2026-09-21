import { portalSections } from "@/lib/portal-sections";

export function PortalNav() {
  return (
    <nav
      aria-label="Portalbereiche"
      className="sm:sticky sm:top-24 sm:w-64 sm:shrink-0"
    >
      <ul className="flex flex-col gap-1 border-l border-stone-200 pl-4">
        {portalSections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="block rounded-sm px-2 py-1.5 text-sm text-charcoal-700 hover:text-olive-700"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
