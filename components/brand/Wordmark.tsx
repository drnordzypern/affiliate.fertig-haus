import Image from "next/image";

/**
 * Brand logo (local copy in /public/brand) followed by the "Partner" label
 * that distinguishes this area from the main site. This is the single place
 * that renders the brand mark.
 */
export function Wordmark({
  className = "",
  decorative = false,
  size = "header",
}: {
  className?: string;
  /** "header": 48px (mobile) / 64px (desktop); "footer": 64px / 80px. */
  size?: "header" | "footer";
  /** Use when the surrounding link/label already names the brand. */
  decorative?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Image
        src="/brand/fertighaus-vergleich-logo.png"
        alt={decorative ? "" : "fertig-haus.net"}
        width={1167}
        height={560}
        priority
        unoptimized
        className={`w-auto ${size === "footer" ? "h-16 lg:h-20" : "h-12 lg:h-16"}`}
      />
      <span className="border-l border-stone-300 pl-3 text-xs font-semibold tracking-[0.18em] text-olive-700 uppercase">
        Partner
      </span>
    </span>
  );
}
