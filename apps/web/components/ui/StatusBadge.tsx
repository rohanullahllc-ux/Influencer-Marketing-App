export type StatusTone = "success" | "warning" | "danger" | "neutral" | "primary";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success-50 text-success-700 ring-success-200",
  warning: "bg-warning-50 text-warning-700 ring-warning-200",
  danger: "bg-danger-50 text-danger-700 ring-danger-200",
  neutral: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  primary: "bg-primary-50 text-primary-700 ring-primary-200",
};

export function StatusBadge({
  label,
  tone,
  dot = true,
}: {
  label: string;
  tone: StatusTone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-label ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

/** Maps the app's own status/enum vocabulary to a StatusBadge tone, kept in one place so every screen agrees on what "healthy" looks like. */
export function toneForStatus(status: string): StatusTone {
  const s = status.toLowerCase();
  if (["active", "approved", "sent", "healthy", "ok", "matched", "completed", "success", "interested"].includes(s))
    return "success";
  if (["pending", "queued", "draft", "processing", "pending_approval", "ambiguous", "warning", "review"].includes(s))
    return "warning";
  if (["blocked", "failed", "rejected", "suppressed", "error", "invalidated", "unauthorized", "forbidden"].includes(s))
    return "danger";
  if (["inactive", "unknown", "archived", "not_evaluated", "not_set"].includes(s)) return "neutral";
  return "neutral";
}
