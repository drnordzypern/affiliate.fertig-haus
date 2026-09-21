/** Loading placeholder. Purely decorative, hidden from assistive technology. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-sm bg-stone-200 motion-reduce:animate-none ${className}`}
    />
  );
}
