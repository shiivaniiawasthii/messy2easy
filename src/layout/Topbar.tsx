import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { ReportPanel } from "../components/ReportPanel";
import { SearchBox } from "../components/SearchBox";
import { Avatar, Button } from "../components/ui";
import { type ActivityKind, type ActivityRow, activityTime, describeActivity, lastSeenActivity, loadActivity, markActivitySeen, unreadActivity } from "../lib/activity";
import { addDays, formatDate, formatTime, initialsOf } from "../lib/format";
import { memberAlerts, plural } from "../lib/members";
import { callNotifications, type NotificationInfo, summaryStatusLine } from "../lib/notifications";
import { type Screen } from "../navigation";
import { useStore } from "../store/store";

type BellTab = "activity" | "attention" | "report";
const ACTIVITY_FILTERS: ["all" | ActivityKind, string][] = [["all", "All"], ["money", "Money"], ["members", "Members"], ["checkins", "Check-ins"]];

/** Who did what: staff and owner actions, newest first, grouped by day. */
function ActivityList({ rows, newIds, onOpenMember }: { rows: ActivityRow[]; newIds: Set<number>; onOpenMember: (id: string) => void }) {
  const { account, data, today } = useStore();
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const memberIds = new Set(data.members.map((m) => m.id));
  const shown = rows.map((a) => ({ a, d: describeActivity(a), at: activityTime(a) })).filter((x) => filter === "all" || x.d.kind === filter);
  const dayLabel = (iso: string) => (iso === today ? "Today" : iso === addDays(today, -1) ? "Yesterday" : formatDate(iso));
  let lastDay = "";
  return <div className="activity-feed">
    <div className="filter-tabs activity-filters">{ACTIVITY_FILTERS.map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {shown.length === 0 && <div className="search-empty"><p>{rows.length === 0 ? "No activity yet. When you or your staff add members, take payments or check people in, it shows up here." : "Nothing of this kind yet."}</p></div>}
    {shown.map(({ a, d, at }) => {
      const day = at.slice(0, 10);
      const heading = day !== lastDay ? <h4 className="activity-day">{dayLabel(day)}</h4> : null;
      lastDay = day;
      const who = a.actor === account.userId ? "You" : a.actor_name || "Someone";
      const canOpen = !!a.member_id && memberIds.has(a.member_id);
      return <div key={a.id}>{heading}<button className={`activity-row ${newIds.has(a.id) ? "new" : ""}`} disabled={!canOpen} onClick={() => canOpen && onOpenMember(a.member_id!)}>
        <span className={`stat-icon ${d.warn ? "stat-rose" : d.kind === "money" ? "" : d.kind === "checkins" ? "stat-amber" : "stat-blue"}`}><Icon name={d.icon} size={16}/></span>
        <span><strong>{who}</strong> {d.text}</span>
        <time>{formatTime(at)}</time>
      </button></div>;
    })}
  </div>;
}

export function NotificationsModal({ activity, newIds, onClose, onOpenRenewals }: { activity: ActivityRow[]; newIds: Set<number>; onClose: () => void; onOpenRenewals: () => void }) {
  const { data, today, viewMember, account, openNotificationSettings } = useStore();
  const isOwner = account.role === "owner";
  const [tab, setTab] = useState<BellTab>(isOwner ? "activity" : "attention");
  const [summaryLine, setSummaryLine] = useState("");
  // The automatic daily summary line shows only once WhatsApp or email is connected.
  useEffect(() => {
    if (!isOwner) return;
    callNotifications<NotificationInfo>({ action: "get_settings" }).then((info) => setSummaryLine(info.configured.email || info.configured.whatsapp ? summaryStatusLine(info.settings) : "")).catch(() => setSummaryLine(""));
  }, [isOwner]);
  const alerts = memberAlerts(data, today);
  const expired = alerts.filter((a) => a.rank === 0).length;
  const expiring = alerts.filter((a) => a.rank > 0 && a.rank < 2).length;
  const dues = data.members.filter((m) => m.balance > 0).length;
  const summary = [expired && `${expired} expired`, expiring && `${expiring} expiring this week`, dues && `${plural(dues, "member")} with dues`].filter(Boolean).join(" · ");
  const openMember = (id: string) => { onClose(); viewMember(id); };
  const attention = alerts.length === 0 ? <div className="search-empty"><p>You’re all caught up.</p></div> : <div className="expiry-list">{alerts.map((a) => <button className="expiry-row" key={a.member.id} onClick={() => openMember(a.member.id)}><Avatar initials={initialsOf(a.member.name)} color={a.member.color} small/><span><strong>{a.member.name}</strong><small>{a.detail}</small></span><div><strong className={a.urgent ? "danger-text" : ""}>{a.label}</strong></div></button>)}</div>;
  return <Modal title="Notifications" subtitle={tab === "attention" ? summary || "Nothing needs attention" : tab === "activity" ? "What you and your staff did" : "Download or share your gym’s numbers"} onClose={onClose}>
    <div className="modal-body">
      {isOwner && summaryLine && <div className="summary-line"><Icon name="bell" size={15}/><span>{summaryLine}</span><button onClick={() => { onClose(); openNotificationSettings(); }}>Settings</button></div>}
      {isOwner && <div className="bell-tabs" role="tablist">{([["activity", "Activity", newIds.size], ["attention", "Needs attention", alerts.length], ["report", "Report", 0]] as const).map(([id, label, count]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{count > 0 && <em>{count}</em>}</button>)}</div>}
      {tab === "activity" && isOwner && <ActivityList rows={activity} newIds={newIds} onOpenMember={openMember}/>}
      {tab === "attention" && attention}
      {tab === "report" && isOwner && <ReportPanel/>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Close</Button>{tab === "attention" && <Button variant="secondary" icon="refresh" onClick={() => { onClose(); onOpenRenewals(); }}>Open renewals</Button>}</div>
    </div>
  </Modal>;
}

export function Topbar({ setScreen, onSearch }: { setScreen: (s: Screen) => void; onSearch: (q: string) => void }) {
  const { data, today, account } = useStore();
  const isOwner = account.role === "owner";
  const [query, setQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [seenId, setSeenId] = useState(() => lastSeenActivity(account.userId));
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const hasAlerts = memberAlerts(data, today).length > 0;
  const unread = unreadActivity(activity, account.userId, seenId);

  // Owner's activity: refresh when the gym data reloads (after saves, when the app comes back) and every minute.
  const refresh = useCallback(() => { if (isOwner && document.visibilityState === "visible") loadActivity().then(setActivity).catch(() => {}); }, [isOwner]);
  useEffect(() => { refresh(); }, [data, refresh]);
  useEffect(() => {
    if (!isOwner) return;
    const timer = window.setInterval(refresh, 60000);
    return () => window.clearInterval(timer);
  }, [isOwner, refresh]);

  const openBell = () => {
    setNewIds(new Set(unread.map((a) => a.id)));
    if (activity[0]) { markActivitySeen(account.userId, activity[0].id); setSeenId(activity[0].id); }
    setShowNotifications(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <header className="topbar"><div className="mobile-brand"><span className="brand-mark">{data.gym.name.trim().charAt(0).toUpperCase() || "G"}</span><strong>{data.gym.name}</strong></div><SearchBox id="global-search" value={query} onChange={setQuery} onSubmit={() => { onSearch(query.trim()); setQuery(""); }} placeholder="Search members, payments..."/><div className="top-actions"><button className="icon-button notification" onClick={openBell} aria-label={unread.length ? `Notifications, ${unread.length} new` : "Notifications"}><Icon name="bell"/>{unread.length > 0 ? <em className="bell-count">{unread.length > 9 ? "9+" : unread.length}</em> : hasAlerts && <span/>}</button><Button icon="plus" onClick={() => setScreen("member-form")}>Add member</Button></div>{showNotifications && <NotificationsModal activity={activity} newIds={newIds} onClose={() => setShowNotifications(false)} onOpenRenewals={() => setScreen("renewals")}/>}</header>;
}
