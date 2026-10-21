import { useState } from "react";
import { BarChart } from "../components/BarChart";
import { Trend } from "../components/ChangeText";
import { Icon, type IconName } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { Avatar, Badge, Button } from "../components/ui";
import { type Member, type Renewal } from "../data/types";
import { addDays, DAYS_LONG, diffDays, formatDate, formatMoney, formatPhone, formatShortMoney, initialsOf, MONTHS, MONTHS_LONG, parseDate, parseDateTime, relativeTime } from "../lib/format";
import { MemberNeedsPanel } from "../components/MemberNeedsPanel";
import { RegistrationPanel } from "../components/RegistrationPanel";
import { expiredWithin, expiringWithin, firstMembershipIds, lastVisits, memberStatus, membersWithDues, plural, stoppedComing } from "../lib/members";
import { type Bucket, collectionBuckets, type DateRange, hourLabel, inRange, type Period, periodRanges, PERIODS, shortHour, WEEKDAYS } from "../lib/periods";
import { type Screen } from "../navigation";
import { useStore } from "../store/store";

export type FocusItem = { id: string; icon: IconName; tone: string; title: string; detail: string; value: string; onClick: () => void };

export function InactiveMembersModal({ members, lastVisit, onClose }: { members: Member[]; lastVisit: Map<string, string>; onClose: () => void }) {
  const { today, viewMember } = useStore();
  return <Modal title="Members who stopped coming" subtitle="Active members with no check-in for 14 days or more. A quick call can bring them back." onClose={onClose}>
    <div className="modal-body"><div className="expiry-list">{members.map((m) => { const last = lastVisit.get(m.id); return <button className="expiry-row" key={m.id} onClick={() => { onClose(); viewMember(m.id); }}><Avatar initials={initialsOf(m.name)} color={m.color} small/><span><strong>{m.name}</strong><small>+91 {formatPhone(m.phone)} · {m.plan}</small></span><div><strong>{last ? `${diffDays(today, last)} days` : "Never"}</strong><small>{last ? `last on ${formatDate(last)}` : "no check-ins"}</small></div></button>; })}</div></div>
  </Modal>;
}

export function Dashboard({ setScreen }: { setScreen: (s: Screen) => void }) {
  const { data, today, viewMember, openRenewals, openPaymentsTab, openMembers, account } = useStore();
  const isOwner = account.role === "owner"; // staff only receive the payments they recorded
  const [period, setPeriod] = useState<Period>("month");
  const [showInactive, setShowInactive] = useState(false);
  const now = new Date();
  const hour = now.getHours();
  const { current, previous, vs } = periodRanges(period, today);
  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const firstIds = firstMembershipIds(data.renewals);
  const isFirstMembership = (r: Renewal) => firstIds.has(r.id);

  // Headline numbers for the period, compared with the period before.
  const sumPayments = (r: DateRange) => data.payments.filter((p) => inRange(p.paidAt, r)).reduce((s, p) => s + p.amount, 0);
  const countRenewals = (r: DateRange) => data.renewals.filter((x) => inRange(x.createdAt, r) && !isFirstMembership(x)).length;
  const countJoined = (r: DateRange) => data.members.filter((m) => !m.pending && inRange(m.joined, r)).length;
  const countCheckins = (r: DateRange) => data.attendance.filter((a) => inRange(a.at, r)).length;
  const collected = sumPayments(current);
  const periodName = PERIODS.find(([p]) => p === period)?.[1].toLowerCase() ?? "";

  // Collections chart.
  const buckets = collectionBuckets(data.payments, period, today);
  const best = buckets.reduce((a, b) => (b.total > a.total ? b : a), buckets[0]);
  const chartTitle = period === "today" ? "Last 14 days" : period === "month" ? `Each day of ${MONTHS_LONG[now.getMonth()]}` : `Each month of ${now.getFullYear()}`;

  // What needs action right now (independent of the period switch).
  const expiring = expiringWithin(data.members, today, 7);
  const lapsed = expiredWithin(data.members, today, 30);
  const withDues = membersWithDues(data.members);
  const lastVisit = lastVisits(data);
  const inactive = stoppedComing(data, today, 14, lastVisit);
  const focus: FocusItem[] = [
    { id: "expiring", icon: "clock", tone: "amber", title: `${plural(expiring.length, "membership")} ending this week`, detail: "Remind them to renew before they lapse", value: formatMoney(expiring.reduce((s, m) => s + m.planPrice, 0)), onClick: () => openRenewals("expiring") },
    { id: "lapsed", icon: "refresh", tone: "rose", title: `${plural(lapsed.length, "member")} didn’t renew`, detail: "Expired in the last 30 days — call to win them back", value: formatMoney(lapsed.reduce((s, m) => s + m.planPrice, 0)), onClick: () => openRenewals("expired") },
    { id: "dues", icon: "wallet", tone: "blue", title: `${plural(withDues.length, "member")} with pending dues`, detail: "Collect at their next visit", value: formatMoney(withDues.reduce((s, m) => s + m.balance, 0)), onClick: () => openPaymentsTab("Unpaid") },
    { id: "inactive", icon: "users", tone: "violet", title: `${plural(inactive.length, "member")} stopped coming`, detail: "Active plan, but no visit in 14+ days", value: String(inactive.length), onClick: () => setShowInactive(true) },
  ];
  // People who registered through the form link and are waiting for a plan.
  const pending = data.members.filter((m) => memberStatus(m, today) === "Pending");
  if (pending.length > 0) focus.unshift({ id: "pending", icon: "check", tone: "amber", title: `${plural(pending.length, "new registration")} to activate`, detail: "Registered with the form link · choose a plan and take payment", value: String(pending.length), onClick: () => openMembers({ status: "Pending" }) });

  // When members come: use the period, or the last 30 days if there is too little data yet.
  let visitRange = current;
  let visitNote = periodName;
  if (countCheckins(current) < 15) { visitRange = { start: addDays(today, -29), end: today }; visitNote = "last 30 days"; }
  const visits = data.attendance.filter((a) => inRange(a.at, visitRange));
  const hours = Array.from({ length: 18 }, (_, i) => i + 5);
  const byHour: Bucket[] = hours.map((h) => ({ key: String(h), label: shortHour(h), total: visits.filter((a) => parseDateTime(a.at).getHours() === h).length }));
  const peak = byHour.reduce((a, b) => (b.total > a.total ? b : a), byHour[0]);
  const peakHour = Number(peak.key);
  const daytime = byHour.filter((b) => Number(b.key) >= 10 && Number(b.key) <= 16);
  const quiet = daytime.reduce((a, b) => (b.total < a.total ? b : a), daytime[0]);
  const byWeekday: Bucket[] = WEEKDAYS.map((label, i) => ({ key: label, label, total: visits.filter((a) => (parseDateTime(a.at).getDay() + 6) % 7 === i).length }));
  const busiestDay = byWeekday.reduce((a, b) => (b.total > a.total ? b : a), byWeekday[0]);
  const visitDays = Math.max(1, diffDays(visitRange.end, visitRange.start) + 1);

  // Renewal rate: of memberships that ended in the window, how many renewed.
  const renewWindow = period === "today" ? { start: addDays(today, -29), end: today } : current;
  const ended = data.renewals.filter((r) => r.expiryDate < today && inRange(r.expiryDate, renewWindow));
  const renewedCount = ended.filter((r) => data.renewals.some((x) => x.memberId === r.memberId && x.startDate > r.startDate)).length;
  const renewRate = ended.length ? Math.round((renewedCount / ended.length) * 100) : null;

  // Which plans bring the money.
  const planTotals = new Map<string, number>();
  data.payments.filter((p) => inRange(p.paidAt, period === "today" ? renewWindow : current)).forEach((p) => { const plan = p.description.replace(/ membership.*$/, ""); planTotals.set(plan, (planTotals.get(plan) ?? 0) + p.amount); });
  const planRows = Array.from(planTotals.entries()).sort((a, b) => b[1] - a[1]);
  const planMax = Math.max(1, ...planRows.map(([, v]) => v));
  const planTotal = planRows.reduce((s, [, v]) => s + v, 0);

  // Today at the gym (always today).
  const todayCheckins = data.attendance.filter((a) => a.at.startsWith(today));
  const inside = todayCheckins.filter((a) => now.getTime() - parseDateTime(a.at).getTime() <= 90 * 60000).length;
  const activity = [
    ...data.attendance.map((a) => ({ id: a.id, memberId: a.memberId, name: a.memberName, text: "Checked in", at: a.at })),
    ...data.payments.map((p) => ({ id: p.id, memberId: p.memberId, name: p.memberName, text: `Paid ${formatMoney(p.amount)} via ${p.method}`, at: p.paidAt })),
    ...data.renewals.map((r) => ({ id: r.id, memberId: r.memberId, name: memberById.get(r.memberId)?.name ?? "Member", text: isFirstMembership(r) ? `Joined on ${r.plan} plan` : "Membership renewed", at: r.createdAt })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);

  return <div className="page">
    <PageHeader eyebrow={`${DAYS_LONG[now.getDay()].toUpperCase()}, ${now.getDate()} ${MONTHS_LONG[now.getMonth()].toUpperCase()}`} title={`Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${(account.name || "there").split(" ")[0]}`} subtitle={`Here’s how ${data.gym.name} is doing.`} action={<div className="filter-tabs period-tabs" role="tablist" aria-label="Period">{PERIODS.map(([id, label]) => <button key={id} role="tab" aria-selected={period === id} className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>}/>
    <section className="stats-grid">
      <StatCard label={isOwner ? "Collections" : "Your collections"} value={formatMoney(collected)} icon="wallet" detail={<Trend current={collected} previous={sumPayments(previous)} vs={vs} format={formatMoney}/>} onClick={() => setScreen("payments")}/>
      <StatCard label="Renewals" value={String(countRenewals(current))} icon="refresh" tone="blue" detail={<Trend current={countRenewals(current)} previous={countRenewals(previous)} vs={vs}/>} onClick={() => setScreen("renewals")}/>
      <StatCard label="New members" value={String(countJoined(current))} icon="users" tone="violet" detail={<Trend current={countJoined(current)} previous={countJoined(previous)} vs={vs}/>} onClick={() => setScreen("members")}/>
      <StatCard label="Check-ins" value={String(countCheckins(current))} icon="check" tone="amber" detail={<Trend current={countCheckins(current)} previous={countCheckins(previous)} vs={vs}/>} onClick={() => setScreen("attendance")}/>
    </section>
    <section className="dashboard-grid">
      <div className="panel collection-panel">
        <div className="panel-head"><div><h2>{isOwner ? "Collections" : "Your collections"}</h2><p>{chartTitle}</p></div><div className="value-total"><strong>{formatMoney(buckets.reduce((s, b) => s + b.total, 0))}</strong><small>{best.total > 0 ? `Best: ${period === "year" ? best.label : `${best.label} ${MONTHS[parseDate(best.key).getMonth()]}`} · ${formatMoney(best.total)}` : "No payments yet"}</small></div></div>
        <BarChart buckets={buckets} dense={buckets.length > 14} format={formatShortMoney} highlight={(b, i) => i === buckets.length - 1} ariaLabel="Collections chart"/>
        <div className="insight-facts"><span>Average <strong>{formatMoney(Math.round(buckets.reduce((s, b) => s + b.total, 0) / Math.max(1, buckets.length)))}</strong> per {period === "year" ? "month" : "day"}</span><span>Still to collect <strong className="amber-text">{formatMoney(withDues.reduce((s, m) => s + m.balance, 0))}</strong></span><span>Collected via UPI <strong>{collected ? Math.round((data.payments.filter((p) => inRange(p.paidAt, current) && p.method === "UPI").reduce((s, p) => s + p.amount, 0) / collected) * 100) : 0}%</strong></span></div>
      </div>
      <div className="panel expiry-panel">
        <div className="panel-head"><div><h2>Focus here</h2><p>What needs action right now</p></div></div>
        <div className="focus-list">{focus.map((f) => <button className="focus-row" key={f.id} onClick={f.onClick}><span className={`stat-icon stat-${f.tone}`}><Icon name={f.icon} size={18}/></span><span><strong>{f.title}</strong><small>{f.detail}</small></span><b>{f.value}</b></button>)}</div>
      </div>
    </section>
    <section className="insight-grid">
      <div className="panel insight-panel">
        <div className="panel-head"><div><h2>When members come</h2><p>Check-ins by hour · {visitNote}</p></div>{peak.total > 0 && <Badge tone="success">Busiest {hourLabel(peakHour)}–{hourLabel(peakHour + 1)}</Badge>}</div>
        <BarChart buckets={byHour} dense format={String} highlight={(b) => b.key === peak.key && b.total > 0} ariaLabel="Check-ins by hour"/>
        <div className="insight-facts"><span>Busiest day <strong>{busiestDay.total > 0 ? busiestDay.label : "—"}</strong></span><span>Quietest time <strong>{quiet ? `${hourLabel(Number(quiet.key))}–${hourLabel(Number(quiet.key) + 1)}` : "—"}</strong></span><span>Average <strong>{Math.round(visits.length / visitDays)}</strong> check-ins a day</span></div>
        <div className="weekday-row">{byWeekday.map((d) => { const max = Math.max(1, ...byWeekday.map((x) => x.total)); return <div key={d.key} className={d.key === busiestDay.key && d.total > 0 ? "busiest" : ""} title={`${d.label}: ${d.total} check-ins`}><i style={{opacity: 0.15 + 0.85 * (d.total / max)}}/><small>{d.label}</small></div>; })}</div>
      </div>
      <div className="panel insight-panel">
        <div className="panel-head"><div><h2>Renewals & plans</h2><p>{period === "today" ? "Last 30 days" : `${PERIODS.find(([p]) => p === period)?.[1]}`}</p></div></div>
        <div className="renew-rate"><div><strong className={renewRate === null ? "" : renewRate >= 70 ? "green-text" : renewRate >= 50 ? "amber-text" : "danger-text"}>{renewRate === null ? "—" : `${renewRate}%`}</strong><span>renewal rate</span></div><div className="renew-rate-bar"><i style={{width: `${renewRate ?? 0}%`}}/></div><small>{ended.length ? `${renewedCount} of ${ended.length} memberships that ended were renewed · ${ended.length - renewedCount} didn’t come back` : "No memberships ended in this period."}</small></div>
        {isOwner && <div className="plan-split"><span className="plan-split-title">Money by plan</span>{planRows.length === 0 && <small className="field-help">No payments in this period.</small>}{planRows.map(([plan, total]) => <div className="plan-split-row" key={plan}><span>{plan}</span><span className="plan-bar"><i style={{width: `${Math.max(4, Math.round((total / planMax) * 100))}%`}}/></span><strong>{formatMoney(total)}</strong><small>{Math.round((total / Math.max(1, planTotal)) * 100)}%</small></div>)}</div>}
      </div>
    </section>
    <section className="panel activity-panel">
      <div className="panel-head"><div><h2>Today at the gym</h2><p>Live attendance and recent activity</p></div><Button variant="secondary" icon="check" onClick={() => setScreen("attendance")}>Open check-in</Button></div>
      <div className="activity-layout">
        <div className="attendance-big"><div className="ring"><strong>{todayCheckins.length}</strong><span>check-ins</span></div><div><strong>{inside}</strong><span>Currently inside</span><small><i className="live-dot"/> Live now</small></div></div>
        <div className="recent-list">
          {activity.map((a) => <button className="recent-row" key={a.id} onClick={() => viewMember(a.memberId)}><Avatar initials={initialsOf(a.name)} color={memberById.get(a.memberId)?.color ?? "mint"} small/><span><strong>{a.name}</strong><small>{a.text}</small></span><time>{relativeTime(a.at, now)}</time></button>)}
        </div>
      </div>
    </section>
    <MemberNeedsPanel/>
    {isOwner && <RegistrationPanel/>}
    {showInactive && <InactiveMembersModal members={inactive} lastVisit={lastVisit} onClose={() => setShowInactive(false)}/>}
  </div>;
}
