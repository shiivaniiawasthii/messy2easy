export function FilterGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return <div className="filter-group"><span>{label}</span><div className="filter-tabs">{options.map((o) => <button key={o} className={value === o ? "active" : ""} onClick={() => onChange(o)}>{o}</button>)}</div></div>;
}
