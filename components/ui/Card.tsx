import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm border border-stone-200 bg-stone-50/60 p-6 shadow-[0_1px_2px_rgba(33,31,26,0.06)] sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}
