export function RequestActivity({ total, items, select }: {
  total: number;
  items: { label: string; count: number; key: string; color: string; active: boolean }[];
  select: (key: string) => void;
}) {
  return <section className="workspace-panel p-4" aria-label="Request activity">
    <h2 className="text-base font-bold">Request activity</h2>
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 180 180" className="size-40 shrink-0" aria-hidden="true">
        {items.map((item, index) => {
          const radius = 72 - index * 19;
          const length = 2 * Math.PI * radius;
          const fraction = total ? Math.min(1, item.count / total) : 0;
          return <g key={item.key} fill="none" strokeWidth="12">
            <circle cx="90" cy="90" r={radius} stroke="currentColor" className="text-slate-100" />
            {fraction > 0 && <circle cx="90" cy="90" r={radius} stroke={item.color}
              strokeDasharray={`${length * fraction} ${length}`} strokeLinecap="round" transform="rotate(-90 90 90)" />}
          </g>;
        })}
        <text x="90" y="94" textAnchor="middle" fill="currentColor" className="text-xl font-bold">{total}</text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {items.map(item => <button key={item.key} type="button" aria-pressed={item.active}
          onClick={() => select(item.key)} className="activity-choice">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden="true" />
          <span className="flex-1 text-start">{item.label}</span><strong className="tabular-nums">{item.count}</strong>
        </button>)}
      </div>
    </div>
    <p className="text-xs text-workspace-muted">Rings show shares of the {total} requests in this view. Categories can overlap.</p>
  </section>;
}
