import { type Bucket } from "../lib/periods";

export function BarChart({ buckets, highlight, dense, format, ariaLabel }: { buckets: Bucket[]; highlight: (b: Bucket, i: number) => boolean; dense?: boolean; format: (n: number) => string; ariaLabel: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  return <div className={`chart dash-chart ${dense ? "dense" : ""}`} aria-label={ariaLabel}>{buckets.map((b, i) => <div className="bar-col" key={b.key} title={`${b.label}: ${format(b.total)}`}>{!dense && <em className="bar-value">{b.total > 0 ? format(b.total) : ""}</em>}<div className="bar-track"><span className={highlight(b, i) ? "current" : ""} style={{height: `${b.total ? Math.max(4, Math.round((b.total / max) * 100)) : 0}%`}}/></div><small>{b.label}</small></div>)}</div>;
}
