export function MetricCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card transition hover:border-border-strong">
      <div className="text-label uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-supporting text-ink-faint">{hint}</div>}
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block no-underline">
        {content}
      </a>
    );
  }
  return content;
}
