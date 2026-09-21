import type { ReactNode } from "react";

type Tone = "info" | "warning";

const toneClasses: Record<Tone, string> = {
  info: "border-olive-500/40 bg-olive-50 text-olive-900",
  warning: "border-terracotta-600/30 bg-terracotta-100 text-terracotta-600",
};

/**
 * Accessible live region for status/notification messages. Content changes
 * inside this region are announced to assistive technology.
 */
export function StatusRegion({
  children,
  tone = "info",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-sm border px-4 py-3 text-sm leading-relaxed ${toneClasses[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
