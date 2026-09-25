import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-300",
  secondary: "bg-white text-ink border border-border-strong hover:bg-surface-muted disabled:text-ink-faint",
  danger: "bg-danger-600 text-white hover:bg-danger-700 disabled:bg-danger-300",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-muted disabled:text-ink-faint",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-supporting",
  md: "h-9 px-4 text-body",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition focus-visible:focus-ring disabled:cursor-not-allowed";

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={`${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a className={`no-underline ${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`} {...props} />
  );
}
