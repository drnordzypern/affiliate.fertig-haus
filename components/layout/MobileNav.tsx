"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavLink } from "@/lib/navigation";

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-sm border border-stone-300 text-charcoal-900"
      >
        <span className="sr-only">
          {open ? "Menü schließen" : "Menü öffnen"}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open && (
        <nav
          id="mobile-nav-panel"
          aria-label="Hauptnavigation (mobil)"
          className="absolute inset-x-0 top-full border-t border-stone-200 bg-stone-50 px-6 py-4 shadow-sm"
        >
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-sm px-3 py-3 text-base text-charcoal-900 hover:bg-olive-50"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
