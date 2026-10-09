import { useMemo, useState } from "react";
import { type Member } from "../data/types";
import { formatDate, formatTime, MONTHS, MONTHS_LONG, parseDate, toISODate } from "../lib/format";
import { lastDayOf } from "../lib/periods";
import { useStore } from "../store/store";
import { Icon } from "./Icon";

const WEEK_HEADER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DayState = "came" | "missed" | "off" | "future";

/** One member's attendance: a month calendar plus the last 6 months at a glance. */
export function MemberAttendance({ member }: { member: Member }) {
  const { data, today } = useStore();
  const [cursor, setCursor] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [year, month] = cursor.split("-").map(Number);

  // First check-in time for each day this member came.
  const visits = useMemo(() => {
    const map = new Map<string, string>();
    data.attendance.forEach((a) => {
      if (a.memberId !== member.id) return;
      const day = a.at.slice(0, 10);
      const prev = map.get(day);
      if (!prev || a.at < prev) map.set(day, a.at);
    });
    return map;
  }, [data.attendance, member.id]);

  // Periods when the member had a valid membership (a missed day only counts inside these).
  const periods = useMemo(() => {
    const list = data.renewals.filter((r) => r.memberId === member.id).map((r) => ({ start: r.startDate, end: r.expiryDate }));
    if (!list.some((r) => r.start === member.startDate)) list.push({ start: member.startDate, end: member.expiryDate });
    return list;
  }, [data.renewals, member.id, member.startDate, member.expiryDate]);
  const isMemberOn = (date: string) => periods.some((p) => date >= p.start && date <= p.end);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${cursor}-${String(i + 1).padStart(2, "0")}`;
    const state: DayState = date > today ? "future" : visits.has(date) ? "came" : isMemberOn(date) ? "missed" : "off";
    return { date, day: i + 1, state, time: visits.get(date) };
  });
  const blanks = (parseDate(days[0].date).getDay() + 6) % 7; // Monday-first calendar
  const came = days.filter((d) => d.state === "came").length;
  const missed = days.filter((d) => d.state === "missed").length;
  const lastVisit = [...visits.keys()].sort().pop();

  // Last 6 months: how many days the member came, and whether they were a member at all.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 6 + i, 1);
    const key = toISODate(d).slice(0, 7);
    const end = lastDayOf(d.getFullYear(), d.getMonth());
    const count = [...visits.keys()].filter((v) => v.startsWith(key)).length;
    const wasMember = periods.some((p) => p.start <= end && p.end >= `${key}-01`);
    return { key, label: MONTHS[d.getMonth()], count, wasMember };
  });
  const maxCount = Math.max(1, ...months.map((m) => m.count));

  const shift = (step: number) => setCursor(toISODate(new Date(year, month - 1 + step, 1)).slice(0, 7));

  return <div className="member-attendance">
    <div className="month-nav ma-nav"><button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><span className="flip"><Icon name="chevron" size={18}/></span></button><strong>{MONTHS_LONG[month - 1]} {year}</strong><button className="icon-button" onClick={() => shift(1)} disabled={cursor >= today.slice(0, 7)} aria-label="Next month"><Icon name="chevron" size={18}/></button></div>
    <div className="ma-stats">
      <div><strong className="green-text">{came}</strong><span>days came</span></div>
      <div><strong className={missed > 0 ? "danger-text" : ""}>{missed}</strong><span>days missed</span></div>
      <div><strong>{lastVisit ? formatDate(lastVisit) : "—"}</strong><span>last visit</span></div>
    </div>
    <div className="ma-calendar" role="grid" aria-label={`${MONTHS_LONG[month - 1]} ${year} attendance`}>
      {WEEK_HEADER.map((w) => <span className="ma-weekday" key={w}>{w}</span>)}
      {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`}/>)}
      {days.map((d) => <div key={d.date} className={`ma-day ${d.state} ${d.date === today ? "is-today" : ""}`} title={d.state === "came" ? `Came at ${formatTime(d.time ?? "")}` : d.state === "missed" ? "Did not come" : d.state === "off" ? "Not a member" : ""}><span>{d.day}</span>{d.state === "came" && <small>{formatTime(d.time ?? "").replace(" ", "").toLowerCase()}</small>}</div>)}
    </div>
    <div className="ma-legend"><span><i className="came"/>Came</span><span><i className="missed"/>Didn’t come</span><span><i className="off"/>Not a member</span></div>
    <div className="ma-months"><strong>Last 6 months</strong>{months.map((m) => <div className="ma-month" key={m.key}><span>{m.label}</span><span className="plan-bar"><i style={{width: `${m.count ? Math.max(4, (m.count / maxCount) * 100) : 0}%`}}/></span><b className={m.wasMember && m.count === 0 ? "danger-text" : ""}>{!m.wasMember ? "—" : m.count === 0 ? "Didn’t come" : `${m.count} days`}</b></div>)}</div>
  </div>;
}
