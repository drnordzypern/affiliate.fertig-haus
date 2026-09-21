import type { ReactNode } from "react";

export function Section({
  children,
  className = "",
  id,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "default" | "muted";
}) {
  return (
    <section
      id={id}
      className={`${tone === "muted" ? "bg-stone-100/60" : ""} ${className}`}
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  level = "h2",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  /** Use "h1" when this is a page's single main heading, not a subsection. */
  level?: "h1" | "h2";
}) {
  const Heading = level;

  return (
    <div
      className={`flex max-w-2xl flex-col gap-4 ${
        align === "center" ? "mx-auto items-center text-center" : "items-start text-left"
      }`}
    >
      {eyebrow && (
        <p className="text-xs font-medium tracking-[0.2em] text-olive-700 uppercase">
          {eyebrow}
        </p>
      )}
      <Heading className="font-serif text-3xl leading-tight text-charcoal-900 sm:text-4xl">
        {title}
      </Heading>
      {description && (
        <p className="text-base leading-relaxed text-charcoal-500">
          {description}
        </p>
      )}
    </div>
  );
}
