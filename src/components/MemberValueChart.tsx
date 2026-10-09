import { type Member } from "../data/types";
import { diffDays, formatMoney, formatShortMoney } from "../lib/format";
import { monthTotals } from "../lib/periods";
import { useStore } from "../store/store";

export function MemberValueChart({ member }: { member: Member }) {
  const { data, today } = useStore();
  const payments = data.payments.filter((p) => p.memberId === member.id);
  const months = monthTotals(payments, 12);
  const max = Math.max(1, ...months.map((m) => m.total));
  const yearTotal = months.reduce((s, m) => s + m.total, 0);
  const lifetime = payments.reduce((s, p) => s + p.amount, 0);
  const monthsSinceJoining = Math.max(1, Math.round(diffDays(today, member.joined) / 30.44));
  return <section className="panel value-panel">
    <div className="panel-head"><div><h2>Money from this member</h2><p>Payments received each month, last 12 months</p></div><div className="value-total"><strong>{formatMoney(yearTotal)}</strong><small>in 12 months</small></div></div>
    <div className="chart value-chart" aria-label="Monthly payments from this member">{months.map((m) => <div className="bar-col" key={m.key} title={`${m.label}: ${formatMoney(m.total)}`}><em className="bar-value">{m.total > 0 ? formatShortMoney(m.total) : ""}</em><div className="bar-track"><span className="current" style={{height: `${m.total ? Math.max(6, Math.round((m.total / max) * 100)) : 0}%`}}/></div><small>{m.label}</small></div>)}</div>
    <div className="value-facts"><span>On average <strong>{formatMoney(Math.round(lifetime / monthsSinceJoining))}</strong> per month since joining</span></div>
  </section>;
}
