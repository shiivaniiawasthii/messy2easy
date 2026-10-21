import { useState } from "react";
import { Icon } from "../components/Icon";
import { IntakeCard } from "../components/IntakeCard";
import { MemberAttendance } from "../components/MemberAttendance";
import { MemberValueChart } from "../components/MemberValueChart";
import { PageHeader } from "../components/PageHeader";
import { Avatar, Badge, Button } from "../components/ui";
import { addDays, diffDays, digitsOnly, formatDate, formatDateLong, formatMoney, formatPhone, formatShortDateTime, initialsOf } from "../lib/format";
import { memberRank, memberStatus, paymentTone, plural, statusTone } from "../lib/members";
import { backLabels, type Screen } from "../navigation";
import { useStore } from "../store/store";

export type ProfileTab = "payments" | "membership" | "attendance";

export function EmptyHistory({ text }: { text: string }) {
  return <div className="history-row"><span className="history-icon"><Icon name="clock" size={18}/></span><span><strong>{text}</strong></span></div>;
}

export function MemberProfile({ memberId, setScreen, backTo }: { memberId: string | null; setScreen: (s: Screen) => void; backTo: Screen }) {
  const { data, today, editMember, openPayment, openRenew, account } = useStore();
  const isOwner = account.role === "owner";
  const [tab, setTab] = useState<ProfileTab>("payments");
  const member = data.members.find((m) => m.id === memberId) ?? data.members[0];
  const backButton = <button className="back-btn" onClick={() => setScreen(backTo)}><Icon name="arrow" size={17}/> {backLabels[backTo] ?? "All members"}</button>;
  if (!member) return <div className="page">{backButton}<PageHeader title="No members yet" subtitle="Add your first member to see their profile."/></div>;
  const status = memberStatus(member, today);
  const days = diffDays(member.expiryDate, today);
  const progress = Math.min(100, Math.max(0, ((diffDays(today, member.startDate) + 1) / member.planDays) * 100));
  const payments = data.payments.filter((p) => p.memberId === member.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const renewals = data.renewals.filter((r) => r.memberId === member.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const visits = data.attendance.filter((a) => a.memberId === member.id).sort((a, b) => b.at.localeCompare(a.at));
  const visits30 = visits.filter((a) => a.at.slice(0, 10) >= addDays(today, -29)).length;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const rank = memberRank(data, member.id);
  const topCount = Math.max(1, Math.ceil(data.members.length * 0.2));
  const expiryText = member.pending ? "No membership yet" : days < 0 ? `Expired ${plural(-days, "day")} ago` : days === 0 ? "Expires today" : `${plural(days, "day")} left`;
  const expiryTone = member.pending ? "amber-text" : days < 0 ? "danger-text" : days <= 7 ? "amber-text" : "green-text";
  const membershipCard = member.pending
    ? <section className="panel detail-card side-card"><div className="panel-head"><h2>Membership</h2><Badge tone={statusTone(status)}>{status}</Badge></div><p className={`side-status ${expiryTone}`}>{expiryText}</p><p className="field-help">Registered through the gym’s form on {formatDateLong(member.joined)}.{member.intake.startDate ? ` It starts by itself on ${formatDateLong(member.intake.startDate)} with the ${member.intake.planName ?? "chosen"} plan (if the gym has a matching plan), and you get a notification. To start now, activate it.` : " Choose a plan and record the payment to start the membership."}</p><Button icon="check" onClick={() => openRenew(member.id)}>Activate membership</Button></section>
    : <section className="panel detail-card side-card"><div className="panel-head"><h2>Membership</h2><Badge tone={statusTone(status)}>{status}</Badge></div><p className={`side-status ${expiryTone}`}>{expiryText}</p><div className="side-progress"><i style={{width: `${progress}%`}}/></div><dl><div><dt>Plan</dt><dd>{member.plan} · {formatMoney(member.planPrice)}</dd></div><div><dt>Started</dt><dd>{formatDateLong(member.startDate)}</dd></div><div><dt>Expires</dt><dd>{formatDateLong(member.expiryDate)}</dd></div></dl><Button variant={days <= 7 ? "primary" : "secondary"} icon="refresh" onClick={() => openRenew(member.id)}>Renew membership</Button></section>;
  return <div className="page profile-page">{backButton}
    <section className="profile-hero"><div className="profile-main"><Avatar initials={initialsOf(member.name)} color={member.color}/><div><div className="profile-name"><h1>{member.name}</h1><Badge tone={statusTone(status)}>{status}</Badge></div><p>{member.code} · {member.pending ? "Registered" : "Member since"} {formatDateLong(member.joined)}</p><div className="contact-line"><span><Icon name="phone" size={16}/> +91 {formatPhone(member.phone)}</span></div></div></div><div className="profile-actions"><a className="btn btn-secondary contact-btn" href={`tel:+91${digitsOnly(member.phone)}`} aria-label={`Call ${member.name}`} title="Call"><Icon name="phone" size={18}/><span>Call</span></a><a className="btn btn-secondary contact-btn" href={`https://wa.me/91${digitsOnly(member.phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${member.name}`} title="WhatsApp"><Icon name="message" size={18}/><span>WhatsApp</span></a><Button variant="secondary" icon="edit" onClick={() => editMember(member.id)}>Edit</Button><Button icon="plus" onClick={() => openPayment(member.id)}>Record payment</Button></div></section>
    <div className={`mini-stats profile-stats ${isOwner ? "" : "two"}`}>
      {isOwner && <div><span>Total paid</span><strong>{formatMoney(totalPaid)}</strong><small>{plural(payments.length, "payment")} so far</small></div>}
      <div><span>Due now</span><strong className={member.balance > 0 ? "amber-text" : "green-text"}>{formatMoney(member.balance)}</strong><small>{member.balance > 0 ? "Collect at next visit" : "Nothing pending"}</small></div>
      {isOwner && <div><span>Value rank</span><strong>#{rank} <em className="rank-of">of {data.members.length}</em></strong><small>{rank <= topCount ? "Top paying member" : "By total paid"}</small></div>}
      <div><span>Visits</span><strong>{visits30}</strong><small>in the last 30 days</small></div>
    </div>
    <div className="profile-grid"><div className="profile-content">
      {isOwner && <MemberValueChart member={member}/>}
      <section className="panel history-panel"><div className="profile-tabs">{([["payments", `${isOwner ? "Payments" : "Your payments"} (${payments.length})`], ["membership", "Membership history"], ["attendance", "Attendance"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div>
        {tab === "payments" && (payments.length === 0 ? <EmptyHistory text="No payments recorded yet"/> : payments.map((p) => <div className="history-row" key={p.id}><span className="history-icon"><Icon name="card" size={18}/></span><span><strong>{formatDate(p.paidAt)}</strong><small>{p.method} · {p.description}</small>{isOwner && <small>Added by {p.addedBy || "unknown"} · {formatShortDateTime(p.addedAt)}</small>}</span>{isOwner && <Badge tone={paymentTone(p.status)}>{p.status}</Badge>}<strong className="history-amount">{formatMoney(p.amount)}</strong></div>))}
        {tab === "membership" && (renewals.length === 0 ? <EmptyHistory text="No membership history yet"/> : renewals.map((r, i) => <div className="history-row" key={r.id}><span className="history-icon"><Icon name="calendar" size={18}/></span><span><strong>{r.plan} · {formatMoney(r.price)}</strong><small>{formatDate(r.startDate)} – {formatDate(r.expiryDate)}</small></span>{i === 0 && status !== "Expired" && <Badge tone="success">Current</Badge>}</div>))}
        {tab === "attendance" && <div className="history-attendance"><MemberAttendance member={member}/></div>}
      </section></div>
      <aside className="profile-side">
        {membershipCard}
        <section className="panel detail-card"><div className="panel-head"><h2>Personal details</h2>{member.source === "form" && <Badge>Registration form</Badge>}</div><dl><div><dt>Emergency contact</dt><dd>{member.emergency ? (/^\d{10}$/.test(member.emergency) ? `+91 ${formatPhone(member.emergency)}` : member.emergency) : "—"}</dd></div><div><dt>Date of birth</dt><dd>{member.dob ? formatDateLong(member.dob) : "—"}</dd></div><div><dt>Email</dt><dd>{member.email || "—"}</dd></div><div><dt>Gender</dt><dd>{member.gender || "—"}</dd></div><div><dt>Address</dt><dd>{member.address || "—"}</dd></div><div><dt>Notes</dt><dd>{member.notes || "—"}</dd></div></dl></section>
        <IntakeCard member={member}/>
      </aside>
    </div>
  </div>;
}
