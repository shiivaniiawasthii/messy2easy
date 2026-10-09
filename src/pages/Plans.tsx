import { db } from "../data/db";
import { useConfirm } from "../components/Confirm";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Badge, Button } from "../components/ui";
import { type Plan } from "../data/types";
import { formatMoney, parseMoney } from "../lib/format";
import { durationLabel, memberStatus } from "../lib/members";
import { useStore } from "../store/store";

export function Plans() {
  const { data, today } = useStore();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const counts = data.plans.map((p) => data.members.filter((m) => m.plan === p.name && memberStatus(m, today) === "Active").length);
  const maxCount = Math.max(0, ...counts);
  const featured = maxCount > 0 ? counts.indexOf(maxCount) : -1;
  return <div className="page"><PageHeader eyebrow="MEMBERSHIP PLANS" title="Plans & pricing" subtitle="Configure simple plans for your gym." action={<Button icon="plus" onClick={() => setEditing("new")}>Create plan</Button>}/>
    <div className="plans-grid">{data.plans.map((p, i) => <div className={`plan-card ${i === featured ? "featured" : ""}`} key={p.id}>{i === featured && <Badge tone="success">Most popular</Badge>}<div className="plan-card-head"><span className={`plan-icon plan-${i % 5}`}><Icon name="calendar"/></span><button className="icon-button" onClick={() => setEditing(p)} aria-label={`${p.name} options`}><Icon name="more"/></button></div><h2>{p.name}</h2><p>{durationLabel(p.days)} access</p><strong>{formatMoney(p.price)}</strong><small>{counts[i]} active member{counts[i] === 1 ? "" : "s"}</small><div className="plan-actions"><Button variant="secondary" icon="edit" onClick={() => setEditing(p)}>Edit plan</Button></div></div>)}
      <button className="new-plan-card" onClick={() => setEditing("new")}><span><Icon name="plus"/></span><strong>Create custom plan</strong><p>Choose any duration and price</p></button>
    </div>
    {editing && <PlanModal plan={editing === "new" ? null : editing} onClose={() => setEditing(null)}/>}
  </div>;
}

export function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const { data, reload } = useStore();
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const [name, setName] = useState(plan?.name ?? "");
  const [days, setDays] = useState(plan ? String(plan.days) : "30");
  const [price, setPrice] = useState(plan ? String(plan.price) : "");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const daysValue = Number(days);
    const priceValue = parseMoney(price);
    if (!trimmed) return setError("Enter a plan name.");
    if (data.plans.some((p) => p.id !== plan?.id && p.name.toLowerCase() === trimmed.toLowerCase())) return setError("A plan with this name already exists.");
    if (!Number.isInteger(daysValue) || daysValue < 1 || daysValue > 3650) return setError("Duration must be a whole number of days between 1 and 3650.");
    if (!Number.isInteger(priceValue) || priceValue < 0) return setError("Enter the price in whole rupees.");
    setSaving(true);
    try {
      await db.savePlan({ id: plan?.id, name: trimmed, days: daysValue, price: priceValue });
      await reload();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!plan || !(await confirm({ title: `Delete the ${plan.name} plan?`, message: "Members already on it keep their current membership.", confirmLabel: "Delete plan", danger: true, icon: "calendar" }))) return;
    setSaving(true);
    try {
      await db.deletePlan(plan.id);
      await reload();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <Modal title={plan ? "Edit plan" : "Create plan"} subtitle={plan ? "Price changes apply to new memberships and renewals." : "Daily, weekly, monthly or any custom duration."} onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="plan-name">Plan name <i>*</i></label><input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly"/></div>
      <div className="form-row"><div className="field"><label htmlFor="plan-days">Duration (days) <i>*</i></label><input id="plan-days" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)}/></div><div className="field"><label htmlFor="plan-price">Price <i>*</i></label><div className="money-input"><span>₹</span><input id="plan-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1200"/></div></div></div>
      <div className="filter-tabs">{[["Day", 1], ["Week", 7], ["Month", 30], ["Quarter", 90], ["Year", 365]].map(([label, d]) => <button type="button" key={label} className={days === String(d) ? "active" : ""} onClick={() => setDays(String(d))}>{label}</button>)}</div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">{plan && <Button variant="ghost" onClick={remove}>Delete plan</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : plan ? "Save plan" : "Create plan"}</Button></div>
    </form>
  </Modal>;
}
