export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong bg-surface-subtle px-6 py-12 text-center">
      <div className="text-card-title text-ink">{title}</div>
      {description && <p className="mt-1.5 max-w-md text-supporting text-ink-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-card border border-danger-200 bg-danger-50 px-6 py-8 text-center">
      <div className="text-card-title text-danger-700">{title}</div>
      {description && <p className="mt-1.5 text-supporting text-danger-700/80">{description}</p>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-6 text-supporting text-ink-subtle">
      <span className="h-3 w-3 animate-pulse rounded-full bg-primary-400" />
      {label}
    </div>
  );
}
