export interface Stage {
  label: string;
  value: number;
}

/**
 * Horizontal magnitude bars for a sequence of pipeline stages. Deliberately
 * not a strict conversion funnel with %-of-previous figures: the stages
 * are real observed counts from different (non-strictly-nested) cohorts,
 * so a computed retention rate between them would misrepresent the data.
 */
export function StageBars({ stages }: { stages: Stage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="w-40 shrink-0 text-supporting text-ink-subtle">{s.label}</div>
          <div className="h-5 flex-1 rounded-pill bg-surface-muted">
            <div
              className="flex h-5 items-center justify-end rounded-pill bg-primary-500 pr-2 text-meta font-medium text-white"
              style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 0)}%` }}
            >
              {s.value > 0 && s.value}
            </div>
          </div>
          {s.value === 0 && <div className="w-6 shrink-0 text-meta text-ink-faint">0</div>}
        </div>
      ))}
    </div>
  );
}
