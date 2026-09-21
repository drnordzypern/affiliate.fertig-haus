import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-sm border border-dashed border-stone-300 bg-stone-100/60 px-6 py-8 text-left">
      <p className="font-serif text-base text-charcoal-900">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-charcoal-500">
        {description}
      </p>
      {action}
    </div>
  );
}
