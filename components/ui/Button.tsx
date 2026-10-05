import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "cta" | "secondary" | "ghost" | "onDark";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-olive-700 text-white hover:bg-olive-900 border border-olive-700",
  cta: "bg-cta text-white hover:bg-cta-hover border border-cta hover:border-cta-hover",
  onDark:
    "bg-transparent text-white border border-white/60 hover:bg-white hover:text-olive-700",
  secondary:
    "bg-transparent text-olive-700 border border-olive-700 hover:bg-olive-700 hover:text-white",
  ghost:
    "bg-transparent text-olive-700 border border-transparent hover:border-olive-500 hover:bg-olive-50",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

type ButtonProps = {
  variant?: Variant;
  children: ReactNode;
  className?: string;
} & (
  | ({ href: string; external?: boolean } & Omit<
      React.AnchorHTMLAttributes<HTMLAnchorElement>,
      "href" | "className" | "children"
    >)
  | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
);

export function Button(props: ButtonProps) {
  const { variant = "primary", children, className = "" } = props;
  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  if (props.href) {
    const { href, external } = props;
    if (external) {
      return (
        <a
          href={href}
          className={classes}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  const buttonOnlyProps = props as Extract<ButtonProps, { href?: undefined }>;

  return (
    <button
      className={classes}
      type={buttonOnlyProps.type ?? "button"}
      disabled={buttonOnlyProps.disabled}
      onClick={buttonOnlyProps.onClick}
      aria-describedby={buttonOnlyProps["aria-describedby"]}
      aria-disabled={buttonOnlyProps["aria-disabled"]}
    >
      {children}
    </button>
  );
}
