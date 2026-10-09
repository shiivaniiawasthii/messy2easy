export function ChangeText({ current, previous, suffix }: { current: number; previous: number; suffix: string }) {
  if (previous <= 0) return <>{suffix ? `No data for ${suffix.replace("from ", "")}` : ""}</>;
  const change = ((current - previous) / previous) * 100;
  return <><span className={change >= 0 ? "positive" : "warning"}>{change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%</span> {suffix}</>;
}

export function Trend({ current, previous, vs, format = String }: { current: number; previous: number; vs: string; format?: (n: number) => string }) {
  if (previous === 0) return <><span>{format(0)}</span> {vs}</>;
  const change = Math.round(((current - previous) / previous) * 100);
  return <><span className={change >= 0 ? "positive" : "warning"}>{change >= 0 ? "↑" : "↓"} {Math.abs(change)}%</span> vs {vs}</>;
}
