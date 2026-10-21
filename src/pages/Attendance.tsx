import { db } from "../data/db";
import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { MemberAttendance } from "../components/MemberAttendance";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchBox } from "../components/SearchBox";
import { Avatar, Badge, Button } from "../components/ui";
import { ATTENDANCE_DAYS_LOADED } from "../data/types";
import { addDays, digitsOnly, formatDate, formatDayTime, formatMoney, formatPhone, formatTime, initialsOf, MONTHS_LONG, parseDate, parseDateTime, toISODate } from "../lib/format";
import { memberStatus, needsAadhaarCheck, plural, statusTone } from "../lib/members";
import { useStore } from "../store/store";

export function Attendance() {
  const { data, today, reload, openRenew, account } = useStore();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<{ name: string; at: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkError, setCheckError] = useState("");
  const q = query.trim().toLowerCase();
  const qDigits = digitsOnly(q);
  const matches = q.length > 1 ? data.members.filter((m) => m.name.toLowerCase().includes(q) || (qDigits.length > 1 && m.phone.includes(qDigits))).slice(0, 6) : [];
  const result = matches.find((m) => m.id === selectedId) ?? matches[0] ?? null;
  const todayList = data.attendance.filter((a) => a.at.startsWith(today)).sort((a, b) => b.at.localeCompare(a.at));
  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const lastCheckin = result ? data.attendance.filter((a) => a.memberId === result.id).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  const status = result ? memberStatus(result, today) : "Active";
  // One check-in per day: the first one today, if any.
  const doneToday = result ? data.attendance.filter((a) => a.memberId === result.id && a.at.startsWith(today)).sort((a, b) => a.at.localeCompare(b.at))[0] : undefined;
  const confirm = async () => {
    if (!result || saving || doneToday) return;
    setSaving(true);
    setCheckError("");
    try {
      const saved = await db.checkIn(result.id);
      setCheckedIn({ name: result.name, at: saved.at });
      void reload(); // refresh lists in the background; the desk can move on
    } catch (err) {
      setCheckError((err as Error).message);
      void reload(); // e.g. another desk checked them in a moment ago
    } finally {
      setSaving(false);
    }
  };
  const reset = () => { setQuery(""); setSelectedId(null); setCheckedIn(null); setCheckError(""); };
  return <div className="page">
    <PageHeader eyebrow="ATTENDANCE" title="Fast check-in" subtitle="Search a member and confirm their entry in seconds."/>
    <div className="attendance-grid">
      <section className="panel checkin-panel">
        <div className="checkin-title"><span className="large-icon"><Icon name="check" size={24}/></span><div><h2>Member check-in</h2><p>Enter name or mobile number</p></div></div>
        <label className="large-search"><Icon name="search"/><input autoFocus value={query} onChange={(e) => {setQuery(e.target.value); setSelectedId(null); setCheckedIn(null)}} onKeyDown={(e) => { if (e.key === "Enter" && result && status === "Active" && !checkedIn && !doneToday) confirm(); }} placeholder="Search member..."/></label>
        {!result && !checkedIn && <div className="search-empty"><span className="key-hint">{q.length > 1 ? "No member found" : "Type at least 2 characters"}</span><p>{q.length > 1 ? "Check the spelling or search by mobile number." : "Membership status and dues are checked automatically."}</p></div>}
        {result && !checkedIn && <div className="checkin-result"><div className="result-profile"><Avatar initials={initialsOf(result.name)} color={result.color}/><span><strong>{result.name}</strong><small>{formatPhone(result.phone)}</small></span>{result.balance > 0 && <Badge tone="warning">{formatMoney(result.balance)} due</Badge>}<Badge tone={statusTone(status)}>{status}</Badge></div><div className="result-meta"><span><small>Membership</small>{result.pending ? "Not started" : result.plan}</span><span><small>Valid until</small>{result.pending ? "—" : formatDate(result.expiryDate)}</span><span><small>Last check-in</small>{lastCheckin ? formatDayTime(lastCheckin.at, today) : "Never"}</span></div>
          {doneToday && <div className="already-in"><Icon name="check" size={18}/><span><strong>Already checked in today at {formatTime(doneToday.at)}</strong><small>Marked by {doneToday.by || "unknown"} · only one check-in per day</small></span></div>}
          {status === "Active" && !doneToday && <><Button icon="check" onClick={confirm} disabled={saving}>{saving ? "Checking in…" : "Confirm check-in"}</Button>{checkError && <p className="form-error">{checkError}</p>}</>}
          {status === "Expired" && <Button icon="refresh" onClick={() => openRenew(result.id)}>Membership expired · Renew</Button>}
          {status === "Pending" && (needsAadhaarCheck(result) ? <Button disabled>New registration · waiting for the owner’s Aadhaar check</Button> : <Button icon="check" onClick={() => openRenew(result.id)}>New registration · Activate membership</Button>)}
          {status === "Suspended" && <Button disabled>Membership suspended</Button>}
          {matches.length > 1 && <div className="expiry-list">{matches.filter((m) => m.id !== result.id).map((m) => <button className="expiry-row" key={m.id} onClick={() => setSelectedId(m.id)}><Avatar initials={initialsOf(m.name)} color={m.color} small/><span><strong>{m.name}</strong><small>{formatPhone(m.phone)}</small></span><div><strong>Select</strong></div></button>)}</div>}
        </div>}
        {checkedIn && <div className="success-state"><span className="success-icon"><Icon name="check" size={28}/></span><h2>Check-in successful</h2><p>{checkedIn.name} checked in at {formatTime(checkedIn.at)}</p><Button variant="secondary" onClick={reset}>Check in another member</Button></div>}
      </section>
      <section className="panel today-panel">
        <div className="panel-head"><div><h2>Today’s attendance</h2><p>{plural(todayList.length, "total check-in")}</p></div><Badge tone="success"><i className="live-dot"/> Live</Badge></div>
        <div className="today-list">
          {todayList.length === 0 && <div className="search-empty"><p>No check-ins yet today.</p></div>}
          {todayList.slice(0, 8).map((a, i) => { const m = memberById.get(a.memberId); return <div className="today-row" key={a.id}><Avatar initials={initialsOf(a.memberName)} color={m?.color ?? "mint"} small/><span><strong>{a.memberName}</strong><small>{i === 0 && Date.now() - parseDateTime(a.at).getTime() < 5 * 60000 ? "Just checked in" : m ? `${memberStatus(m, today)} membership` : "Member"}{a.by && ` · by ${a.by}`}</small></span><time>{formatTime(a.at)}</time></div>; })}
        </div>
        <button className="full-link" onClick={() => document.querySelector(".register-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}>See full register <Icon name="arrow" size={16}/></button>
      </section>
    </div>
    {account.role === "owner" && <CheckinLog/>}
    <AttendanceRegister/>
  </div>;
}

const LOG_PAGE_SIZE = 20;

/** Owner's log: every check-in of a day, when it happened and who marked it. */
function CheckinLog() {
  const { data, today } = useStore();
  const [day, setDay] = useState(today);
  const [page, setPage] = useState(0);
  const oldest = addDays(today, -ATTENDANCE_DAYS_LOADED);
  const entries = data.attendance.filter((a) => a.at.startsWith(day)).sort((a, b) => a.at.localeCompare(b.at));
  const seen = new Set<string>();
  const rows = entries.map((a) => { const repeat = seen.has(a.memberId); seen.add(a.memberId); return { ...a, repeat }; }).reverse();
  const repeats = rows.filter((r) => r.repeat).length;
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / LOG_PAGE_SIZE) - 1));
  const shift = (step: number) => { setDay(addDays(day, step)); setPage(0); };
  return <section className="panel table-panel checkin-log">
    <div className="register-toolbar">
      <div><h2>Check-in log</h2><p>Who marked each check-in and when. {repeats > 0 ? `${repeats} repeat ${repeats === 1 ? "entry" : "entries"} this day (from before the once-a-day rule).` : "One check-in per member per day."}</p></div>
      <div className="month-nav"><button className="icon-button" onClick={() => shift(-1)} disabled={day <= oldest} aria-label="Previous day"><span className="flip"><Icon name="chevron" size={18}/></span></button><strong>{day === today ? "Today" : formatDate(day)}</strong><button className="icon-button" onClick={() => shift(1)} disabled={day >= today} aria-label="Next day"><Icon name="chevron" size={18}/></button></div>
    </div>
    <div className="log-list">
      {rows.length === 0 && <div className="search-empty"><p>No check-ins on this day.</p></div>}
      {rows.slice(safePage * LOG_PAGE_SIZE, (safePage + 1) * LOG_PAGE_SIZE).map((r) => <div className="log-row" key={r.id}>
        <time>{formatTime(r.at)}</time>
        <span><strong>{r.memberName}</strong><small>Marked by {r.by || "unknown"}</small></span>
        {r.repeat && <Badge tone="warning">Repeat</Badge>}
      </div>)}
    </div>
    <Pagination page={safePage} pageSize={LOG_PAGE_SIZE} total={rows.length} noun="check-ins" onPage={setPage}/>
  </section>;
}

export const REGISTER_PAGE_SIZE = 25;

export const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function AttendanceRegister() {
  const { data, today, viewMember } = useStore();
  const [cursor, setCursor] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const openMember = data.members.find((m) => m.id === openId);
  const [page, setPage] = useState(0);
  const [year, month] = cursor.split("-").map(Number);
  const days = Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => `${cursor}-${String(i + 1).padStart(2, "0")}`);
  const monthStart = days[0];
  const monthEnd = days[days.length - 1];

  const cameOn = useMemo(() => {
    const set = new Set<string>();
    data.attendance.forEach((a) => set.add(`${a.memberId}|${a.at.slice(0, 10)}`));
    return set;
  }, [data.attendance]);

  // Members who were with the gym at some point this month.
  const q = query.trim().toLowerCase();
  const rows = data.members
    .filter((m) => m.joined <= monthEnd && (m.expiryDate >= monthStart || days.some((d) => cameOn.has(`${m.id}|${d}`))))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.phone.includes(digitsOnly(q) || "§"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ member: m, came: days.map((d) => cameOn.has(`${m.id}|${d}`)) }));
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / REGISTER_PAGE_SIZE) - 1));
  const visible = rows.slice(safePage * REGISTER_PAGE_SIZE, (safePage + 1) * REGISTER_PAGE_SIZE);
  const shift = (step: number) => { setCursor(toISODate(new Date(year, month - 1 + step, 1)).slice(0, 7)); setPage(0); };

  return <section className="panel table-panel register-panel">
    <div className="register-toolbar">
      <div><h2>Attendance register</h2><p>✓ means the member came that day. Tap a name to see their full attendance.</p></div>
      <div className="month-nav"><button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><span className="flip"><Icon name="chevron" size={18}/></span></button><strong>{MONTHS_LONG[month - 1]} {year}</strong><button className="icon-button" onClick={() => shift(1)} disabled={cursor >= today.slice(0, 7)} aria-label="Next month"><Icon name="chevron" size={18}/></button></div>
      <SearchBox value={query} onChange={(v) => { setQuery(v); setPage(0); }} placeholder="Search member"/>
    </div>
    <div className="register-scroll">
      <table className="register">
        <thead><tr><th className="name-col">Member</th>{days.map((d) => <th key={d} className={d === today ? "today" : ""}><span>{Number(d.slice(8))}</span><small>{WEEKDAY_LETTERS[parseDate(d).getDay()]}</small></th>)}<th className="total-col">Days came</th></tr></thead>
        <tbody>{visible.map((r) => { const total = r.came.filter(Boolean).length; return <tr key={r.member.id}>
          <th className="name-col" scope="row"><button onClick={() => setOpenId(r.member.id)} title="See this member’s attendance"><strong>{r.member.name}</strong><small>{r.member.plan}</small></button></th>
          {r.came.map((came, i) => <td key={days[i]} className={days[i] === today ? "today" : ""} title={`${formatDate(days[i])}: ${came ? "came" : "did not come"}`}>{came ? <span className="reg-tick">✓</span> : null}</td>)}
          <td className="total-col"><strong className={total === 0 ? "danger-text" : ""}>{total}</strong></td>
        </tr>; })}</tbody>
      </table>
      {rows.length === 0 && <div className="search-empty"><p>No members for this month.</p></div>}
    </div>
    <Pagination page={safePage} pageSize={REGISTER_PAGE_SIZE} total={rows.length} noun="members" onPage={setPage}/>
    {openMember && <Modal title={openMember.name} subtitle={`Attendance · ${openMember.plan} plan`} onClose={() => setOpenId(null)}><div className="modal-body"><MemberAttendance member={openMember}/><div className="modal-actions"><Button variant="secondary" onClick={() => { setOpenId(null); viewMember(openMember.id); }}>Open profile</Button><Button onClick={() => setOpenId(null)}>Done</Button></div></div></Modal>}
  </section>;
}
