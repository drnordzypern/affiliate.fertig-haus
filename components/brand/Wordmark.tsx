/**
 * Temporary text wordmark. Replace with the approved logo component once
 * available — this is the single place that needs to change.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-serif text-lg tracking-[0.14em] text-charcoal-900 uppercase sm:text-xl ${className}`}
    >
      Fertig Haus
      <span className="mx-2 text-olive-600" aria-hidden="true">
        |
      </span>
      <span className="text-olive-700">Partner</span>
    </span>
  );
}
