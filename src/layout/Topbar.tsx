import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { SearchBox } from "../components/SearchBox";
import { Avatar, Button } from "../components/ui";
import { initialsOf } from "../lib/format";
import { memberAlerts, plural } from "../lib/members";
import { type Screen } from "../navigation";
import { useStore } from "../store/store";

export function NotificationsModal({ onClose, onOpenRenewals }: { onClose: () => void; onOpenRenewals: () => void }) {
  const { data, today, viewMember } = useStore();
  const alerts = memberAlerts(data, today);
  const expired = alerts.filter((a) => a.rank === 0).length;
  const expiring = alerts.filter((a) => a.rank > 0 && a.rank < 2).length;
  const dues = data.members.filter((m) => m.balance > 0).length;
  const summary = [expired && `${expired} expired`, expiring && `${expiring} expiring this week`, dues && `${plural(dues, "member")} with dues`].filter(Boolean).join(" · ");
  return <Modal title="Notifications" subtitle={summary || "Nothing needs attention"} onClose={onClose}>
    <div className="modal-body">
      {alerts.length === 0 ? <div className="search-empty"><p>You’re all caught up.</p></div> : <div className="expiry-list">{alerts.map((a) => <button className="expiry-row" key={a.member.id} onClick={() => { onClose(); viewMember(a.member.id); }}><Avatar initials={initialsOf(a.member.name)} color={a.member.color} small/><span><strong>{a.member.name}</strong><small>{a.detail}</small></span><div><strong className={a.urgent ? "danger-text" : ""}>{a.label}</strong></div></button>)}</div>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="secondary" icon="refresh" onClick={() => { onClose(); onOpenRenewals(); }}>Open renewals</Button></div>
    </div>
  </Modal>;
}

export function Topbar({ setScreen, onSearch }: { setScreen: (s: Screen) => void; onSearch: (q: string) => void }) {
  const { data, today } = useStore();
  const [query, setQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const hasAlerts = memberAlerts(data, today).length > 0;
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
  return <header className="topbar"><div className="mobile-brand"><span className="brand-mark">{data.gym.name.trim().charAt(0).toUpperCase() || "G"}</span><strong>{data.gym.name}</strong></div><SearchBox id="global-search" value={query} onChange={setQuery} onSubmit={() => { onSearch(query.trim()); setQuery(""); }} placeholder="Search members, payments..."/><div className="top-actions"><button className="icon-button notification" onClick={() => setShowNotifications(true)} aria-label="Notifications"><Icon name="bell"/>{hasAlerts && <span/>}</button><Button icon="plus" onClick={() => setScreen("member-form")}>Add member</Button></div>{showNotifications && <NotificationsModal onClose={() => setShowNotifications(false)} onOpenRenewals={() => setScreen("renewals")}/>}</header>;
}
