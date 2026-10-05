import Image from "next/image";

/**
 * Brand logo, rendered exactly as on fertig-haus.net: the unmodified logo
 * (local copy in /public/brand, byte-identical to the main site's PNG),
 * `h-12 md:h-16` in the header and a constant 80px (`h-20`) in the footer,
 * width auto so the 1167x560 proportions are preserved. No added label.
 * This is the single place that renders the brand mark.
 */
export function Wordmark({
  className = "",
  decorative = false,
  size = "header",
}: {
  className?: string;
  /** "header": 48px (mobile) / 64px (from 768px); "footer": 80px. */
  size?: "header" | "footer";
  /** Use when the surrounding link/label already names the brand. */
  decorative?: boolean;
}) {
  return (
    <Image
      src="/brand/fertighaus-vergleich-logo.png"
      alt={decorative ? "" : "fertig-haus.net"}
      width={1167}
      height={560}
      priority
      unoptimized
      className={`w-auto object-contain ${
        size === "footer" ? "h-20" : "h-12 md:h-16"
      } ${className}`}
    />
  );
}
