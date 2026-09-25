import type { StatusTone } from "./StatusBadge";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success-50 border-success-200 text-success-900",
  warning: "bg-warning-50 border-warning-200 text-warning-900",
  danger: "bg-danger-50 border-danger-200 text-danger-900",
  neutral: "bg-neutral-50 border-border text-ink",
  primary: "bg-primary-50 border-primary-200 text-primary-900",
};

export function Alert({
  tone = "neutral",
  title,
  children,
}: {
  tone?: StatusTone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-card border px-4 py-3 text-body ${TONE_CLASSES[tone]}`}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5 text-supporting" : ""}>{children}</div>
    </div>
  );
}
