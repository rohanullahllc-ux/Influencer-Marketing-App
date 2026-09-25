export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-border bg-surface shadow-card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          {title && <div className="text-card-title text-ink">{title}</div>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
