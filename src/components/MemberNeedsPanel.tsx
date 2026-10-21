import { type Member } from "../data/types";
import { answerGroup, GOAL_FILTERS, hasAnswers, matchesNeed, TIME_FILTERS } from "../lib/intake";
import { useStore } from "../store/store";
import { Icon, type IconName } from "./Icon";

/**
 * Dashboard: what members asked for on the joining form, so the owner can offer personal training
 * and diet plans, check health and plan batches. Every number opens exactly those members
 * (counted over all members, like the Members list it opens).
 */
export function MemberNeedsPanel() {
  const { data, openMembers } = useStore();
  const current = data.members;
  const answered = current.filter((m) => hasAnswers(m.intake));
  if (answered.length === 0) return null;

  const count = (need: string) => answered.filter((m) => matchesNeed(m.intake, need)).length;
  const tiles: [string, string, IconName, string][] = [
    ["Personal training", "want a personal training program", "users", "stat-violet"],
    ["Diet plan", "need help with diet planning", "check", ""],
    ["Health check", "have a medical condition or take medicines", "shield", "stat-rose"],
    ["Beginners", "are new to working out", "sparkles", "stat-amber"],
  ];
  const breakdown = (key: "goal" | "workoutTime", groups: string[]) => groups.filter((g) => g !== "All")
    .map((g) => ({ group: g, total: answered.filter((m: Member) => answerGroup(key, m.intake[key]) === g).length }))
    .filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const goals = breakdown("goal", GOAL_FILTERS);
  const times = breakdown("workoutTime", TIME_FILTERS);
  const max = Math.max(1, ...goals.map((g) => g.total), ...times.map((t) => t.total));

  return <section className="panel needs-panel">
    <div className="panel-head"><div><h2>What your members want</h2><p>From the joining form · {answered.length} of {current.length} members answered · tap a number to see them</p></div></div>
    <div className="needs-tiles">{tiles.map(([need, detail, icon, tone]) => <button key={need} onClick={() => openMembers({ need })}><span className={`stat-icon ${tone}`}><Icon name={icon} size={17}/></span><span><strong>{count(need)}</strong><small>{detail}</small></span></button>)}</div>
    <div className="needs-split">
      {([["Fitness goals", goals, "goal"], ["Preferred workout time", times, "time"]] as const).map(([title, rows, filter]) => <div key={title}>
        <span className="plan-split-title">{title}</span>
        {rows.length === 0 ? <small className="field-help">No answers yet.</small> : rows.map((r) => <button className="needs-bar" key={r.group} onClick={() => openMembers({ [filter]: r.group })}><span>{r.group}</span><span className="plan-bar"><i style={{ width: `${Math.max(6, Math.round((r.total / max) * 100))}%` }}/></span><strong>{r.total}</strong></button>)}
      </div>)}
    </div>
  </section>;
}
