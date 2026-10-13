import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Avatar, Badge, Button } from "../components/ui";
import { type Member } from "../data/types";
import { diffDays, digitsOnly, formatDate, formatMoney, formatPhone, initialsOf } from "../lib/format";
import { expiredWithin, expiringWithin, expiryLabel, membersWithDues, plural } from "../lib/members";
import { useStore } from "../store/store";
import { type RenewalTab } from "../navigation";

export function Renewals({ initialTab = "expiring" }: { initialTab?: RenewalTab }) {
  const { data, today, viewMember, openRenew, openPayment } = useStore();
  const [tab, setTab] = useState<RenewalTab>(initialTab);
  const [showReminders, setShowReminders] = useState(false);
  const lists: Record<RenewalTab, Member[]> = {
    expiring: expiringWithin(data.members, today, 7),
    expired: expiredWithin(data.members, today, Infinity),
    unpaid: membersWithDues(data.members),
  };
  const list = lists[tab];
  const info: Record<RenewalTab, [string, string]> = {
    expiring: [`${plural(lists.expiring.length, "membership")} expire${lists.expiring.length === 1 ? "s" : ""} this week`, "Renewing early prevents interruptions for members."],
    expired: [`${plural(lists.expired.length, "membership")} ${lists.expired.length === 1 ? "has" : "have"} expired`, "Follow up to bring these members back."],
    unpaid: [`${plural(lists.unpaid.length, "member")} ${lists.unpaid.length === 1 ? "has" : "have"} outstanding dues`, "Collect balances to keep your accounts up to date."],
  };
  return <div className="page"><PageHeader eyebrow="RENEWALS" title="Renewals" subtitle="Stay ahead of expiries and follow up on dues." action={<Button variant="secondary" icon="bell" onClick={() => setShowReminders(true)} disabled={list.length === 0}>Send reminders</Button>}/>
    <div className="renewal-tabs">{([["expiring", "Expiring soon"], ["expired", "Expired"], ["unpaid", "Unpaid balances"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label} <em>{lists[id].length}</em></button>)}</div>
    <section className="panel renewal-panel"><div className="renewal-info"><span className="stat-icon stat-amber"><Icon name="clock"/></span><div><strong>{info[tab][0]}</strong><p>{info[tab][1]}</p></div></div>
      {list.length === 0 && <div className="search-empty"><p>Nothing here right now.</p></div>}
      {list.map((m) => { const days = diffDays(m.expiryDate, today); return <div className="renewal-row" key={m.id}><div className="renewal-person"><Avatar initials={initialsOf(m.name)} color={m.color}/><span><strong>{m.name}</strong><small>{formatPhone(m.phone)}</small></span></div><div><small>Current plan</small><strong>{m.plan}</strong></div><div><small>{days < 0 ? "Expired" : "Expires"}</small><strong className={days <= 1 ? "danger-text" : ""}>{days >= 0 && days <= 1 ? expiryLabel(days) : formatDate(m.expiryDate)}</strong></div><div><small>Balance</small><strong>{m.balance ? formatMoney(m.balance) : "No dues"}</strong></div><div className="renewal-actions"><Button variant="secondary" onClick={() => viewMember(m.id)}>View</Button>{tab === "unpaid" ? <Button onClick={() => openPayment(m.id)}>Collect</Button> : <Button onClick={() => openRenew(m.id)}>Renew</Button>}</div></div>; })}
    </section>
    {showReminders && <ReminderModal members={list} kind={tab} onClose={() => setShowReminders(false)}/>}
  </div>;
}

export function ReminderModal({ members, kind, onClose }: { members: Member[]; kind: RenewalTab; onClose: () => void }) {
  const { data } = useStore();
  const message = (m: Member) => {
    const first = m.name.split(" ")[0];
    const dues = m.balance > 0 ? ` Outstanding balance: ${formatMoney(m.balance)}.` : "";
    if (kind === "expired") return `Hi ${first}, your ${data.gym.name} membership expired on ${formatDate(m.expiryDate)}. Renew today to continue your workouts.${dues}`;
    if (kind === "unpaid") return `Hi ${first}, this is a reminder from ${data.gym.name}: you have an outstanding balance of ${formatMoney(m.balance)}. Please clear it at the front desk or via UPI.`;
    return `Hi ${first}, your ${data.gym.name} ${m.plan} membership expires on ${formatDate(m.expiryDate)}. Please renew to continue without interruption.${dues}`;
  };
  return <Modal title="Send reminders" subtitle="Opens WhatsApp with a ready-to-send message for each member." onClose={onClose}>
    <div className="modal-body">{members.map((m) => <div className="history-row" key={m.id}><Avatar initials={initialsOf(m.name)} color={m.color} small/><span><strong>{m.name}</strong><small>{message(m)}</small></span><a className="btn btn-secondary" href={`https://wa.me/91${digitsOnly(m.phone)}?text=${encodeURIComponent(message(m))}`} target="_blank" rel="noopener noreferrer"><Icon name="phone" size={18}/><span>WhatsApp</span></a></div>)}</div>
  </Modal>;
}
