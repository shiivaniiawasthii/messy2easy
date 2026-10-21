import { type Member } from "../data/types";
import { addDays } from "../lib/format";
import { answerGroup, answerGroups, hasAnswers, matchesNeed } from "../lib/intake";
import { hourLabel } from "../lib/periods";
import { type MemberView } from "../pages/Members";
import { useStore } from "../store/store";
import { Icon, type IconName } from "./Icon";

type Row = { label: string; total: number; open?: Partial<MemberView> };

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/**
 * Dashboard: what members want and how the gym is used, so the owner can plan offers, marketing
 * and staff shifts. Joining-form answers (needs, reach, goals, preferred time) are counted over all
 * members who answered, like the Members list each number opens; crowd time comes from real
 * check-ins of the last 30 days.
 */
export function MemberInsightsPanel() {
  const { data, today, openMembers } = useStore();
  const answered = data.members.filter((m) => hasAnswers(m.intake));
  const since = addDays(today, -29);
  const visits = data.attendance.filter((a) => a.at.slice(0, 10) >= since);
  if (answered.length === 0 && visits.length === 0) return null;

  const needCount = (need: string) => answered.filter((m) => matchesNeed(m.intake, need)).length;
  const tiles: [string, string, IconName, string][] = [
    ["Personal training", "want personal training", "users", "stat-violet"],
    ["Diet plan", "need a diet plan", "check", ""],
    ["Health check", "medical condition or medicines", "shield", "stat-rose"],
    ["Beginners", "new to working out", "sparkles", "stat-amber"],
  ];
  const groups = (key: "goal" | "workoutTime" | "heardFrom", filter?: keyof MemberView): Row[] => answerGroups(key)
    .map((g) => ({ label: g, total: answered.filter((m: Member) => answerGroup(key, m.intake[key]) === g).length, open: filter ? { [filter]: g } : undefined }))
    .filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

  // Crowd: check-ins per hour (last 30 days), busiest first.
  const byHour = new Map<number, number>();
  visits.forEach((a) => { const h = Number(a.at.slice(11, 13)); byHour.set(h, (byHour.get(h) ?? 0) + 1); });
  const busiest: Row[] = [...byHour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h, n]) => ({ label: `${hourLabel(h)}–${hourLabel(h + 1)}`, total: n }));

  const blocks: { title: string; note: string; rows: Row[]; of: number; empty: string }[] = [
    { title: "Reach: how people found the gym", note: `${answered.length} answers`, rows: groups("heardFrom", "heard"), of: answered.length, empty: "No answers yet." },
    { title: "Fitness goals", note: `${answered.length} answers`, rows: groups("goal", "goal"), of: answered.length, empty: "No answers yet." },
    { title: "Crowd time: busiest hours", note: `${visits.length} check-ins, last 30 days`, rows: busiest, of: visits.length, empty: "No check-ins in the last 30 days." },
    { title: "Preferred workout time", note: "what members asked for", rows: groups("workoutTime", "time"), of: answered.length, empty: "No answers yet." },
  ];

  return <section className="panel needs-panel">
    <div className="panel-head"><div><h2>Member insights</h2><p>From the joining form ({answered.length} of {data.members.length} members answered) and check-ins · tap a row to see those members</p></div></div>
    {answered.length > 0 && <div className="needs-tiles">{tiles.map(([need, detail, icon, tone]) => { const n = needCount(need); return <button key={need} onClick={() => openMembers({ need })}><span className={`stat-icon ${tone}`}><Icon name={icon} size={17}/></span><span><strong>{n} <em>{pct(n, answered.length)}%</em></strong><small>{detail}</small></span></button>; })}</div>}
    <div className="needs-split">
      {blocks.map((b) => { const max = Math.max(1, ...b.rows.map((r) => r.total)); return <div key={b.title}>
        <span className="plan-split-title">{b.title} <small>· {b.note}</small></span>
        {b.rows.length === 0 ? <small className="field-help">{b.empty}</small> : b.rows.map((r) => {
          const content = <><span>{r.label}</span><span className="plan-bar"><i style={{ width: `${Math.max(6, Math.round((r.total / max) * 100))}%` }}/></span><strong>{pct(r.total, b.of)}%</strong><small>{r.total}</small></>;
          return r.open ? <button className="needs-bar" key={r.label} onClick={() => openMembers(r.open!)}>{content}</button> : <div className="needs-bar" key={r.label}>{content}</div>;
        })}
      </div>; })}
    </div>
  </section>;
}
