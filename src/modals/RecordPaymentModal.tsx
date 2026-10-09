import { db } from "../data/db";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { Avatar, Button } from "../components/ui";
import { type Payment, paymentMethods } from "../data/types";
import { formatDateLong, formatMoney, formatPhone, initialsOf, newId, nowLocal, parseMoney } from "../lib/format";
import { useStore } from "../store/store";

export function MemberPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useStore();
  const member = data.members.find((m) => m.id === value);
  const sorted = [...data.members].sort((a, b) => a.name.localeCompare(b.name));
  return <div className="member-select">{member ? <><Avatar initials={initialsOf(member.name)} color={member.color} small/><span><strong>{member.name}</strong><small>{formatPhone(member.phone)}{member.balance > 0 ? ` · ${formatMoney(member.balance)} due` : " · No dues"}</small></span></> : <span><strong>Choose a member</strong></span>}<Icon name="chevron" size={16}/><select className="select-overlay" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Member">{!member && <option value="">Choose a member</option>}{sorted.map((m) => <option key={m.id} value={m.id}>{m.name} — {formatPhone(m.phone)}{m.balance > 0 ? ` (${formatMoney(m.balance)} due)` : ""}</option>)}</select></div>;
}

export function RecordPaymentModal({ initialMemberId, onClose }: { initialMemberId?: string; onClose: () => void }) {
  const { data, today, reload, openRenew } = useStore();
  const initial = data.members.find((m) => m.id === initialMemberId) ?? data.members.find((m) => m.balance > 0) ?? data.members[0];
  const [memberId, setMemberId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState(initial && initial.balance > 0 ? String(initial.balance) : "");
  const [method, setMethod] = useState("UPI");
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);
  const member = data.members.find((m) => m.id === memberId);
  const value = parseMoney(amount);
  const prev = member?.balance ?? 0;
  const after = Math.max(0, prev - (Number.isFinite(value) ? value : 0));
  const choose = (id: string) => {
    const m = data.members.find((x) => x.id === id);
    setMemberId(id);
    setAmount(m && m.balance > 0 ? String(m.balance) : "");
    setError("");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return setError("Choose a member.");
    if (!Number.isInteger(value) || value <= 0) return setError("Enter an amount in whole rupees, greater than ₹0.");
    if (value > prev) return setError(`Amount is more than the outstanding balance of ${formatMoney(prev)}.`);
    if (!date || date > today) return setError("Transaction date cannot be in the future.");
    const payment: Payment = { id: newId(), memberId: member.id, memberName: member.name, paidAt: date === today ? nowLocal() : `${date}T12:00:00`, method, amount: value, status: prev - value <= 0 ? "Paid" : "Partial", description: `${member.plan} membership` };
    setError("");
    setSaving(true);
    try {
      await db.recordPayment({ memberId: member.id, amount: value, method, date, note: payment.description });
      await reload();
      setSaved(payment);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return <Modal title={saved ? "Payment recorded" : "Record payment"} subtitle={saved ? `Saved to ${saved.memberName}’s payment history.` : "Add a full or partial member payment."} onClose={onClose}>
    {saved ? <div className="modal-success"><span className="success-icon"><Icon name="check" size={28}/></span><strong>{formatMoney(saved.amount)} received from {saved.memberName}</strong><p>Paid via {saved.method} on {formatDateLong(saved.paidAt)}</p><Button onClick={onClose}>Done</Button></div>
    : <form onSubmit={submit} noValidate>
      <div className="field"><label>Member</label><MemberPicker value={memberId} onChange={choose}/></div>
      <div className="form-row"><div className="field"><label htmlFor="pay-amount">Amount received</label><div className="money-input"><span>₹</span><input id="pay-amount" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} placeholder="0"/></div></div><div className="field"><label htmlFor="pay-method">Payment method</label><select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>{paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></div></div>
      <div className="balance-box"><span>Plan total<strong>{formatMoney(member?.planPrice ?? 0)}</strong></span><span>Previous balance<strong>{formatMoney(prev)}</strong></span><span>Balance after payment<strong className={after === 0 ? "green-text" : "amber-text"}>{formatMoney(after)}</strong></span></div>
      <div className="field"><label htmlFor="pay-date">Transaction date</label><input id="pay-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)}/></div>
      {member && prev <= 0 && <p className="form-note">{member.name} has no outstanding dues. To collect for a new membership period, renew the membership.</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button>{member && prev <= 0 ? <Button icon="refresh" onClick={() => openRenew(member.id)}>Renew membership</Button> : <Button type="submit" disabled={saving}>{saving ? "Saving…" : Number.isFinite(value) && value > 0 ? `Record ${formatMoney(value)}` : "Record payment"}</Button>}</div>
    </form>}
  </Modal>;
}
