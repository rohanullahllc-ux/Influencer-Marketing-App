import { StatusBadge, toneForStatus } from "./StatusBadge";

export function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <p className="text-supporting text-ink-faint">none yet</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1.5 rounded-control border border-border bg-surface-subtle px-2.5 py-1.5">
          <StatusBadge label={k.replace(/_/g, " ")} tone={toneForStatus(k)} />
          <span className="text-supporting font-semibold text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}
