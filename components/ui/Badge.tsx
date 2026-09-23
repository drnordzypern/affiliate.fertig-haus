import type { ReactNode } from "react";

type Tone = "olive" | "neutral" | "terracotta";

const toneClasses: Record<Tone, string> = {
  olive: "bg-olive-100 text-olive-900 border-olive-500/40",
  neutral: "bg-stone-100 text-charcoal-700 border-stone-300",
  terracotta: "bg-terracotta-100 text-terracotta-600 border-terracotta-600/30",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 self-start items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide uppercase ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Prominent label marking UI that is not yet operational. */
export function InactiveBadge({ className = "" }: { className?: string }) {
  return (
    <Badge tone="terracotta" className={className}>
      Nicht aktiv
    </Badge>
  );
}
