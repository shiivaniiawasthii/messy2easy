import { useCallback, useEffect, useState } from "react";
import { SIGN_OUT_CONFIRM, useConfirm } from "../components/Confirm";
import { Icon } from "../components/Icon";
import { LoginShare } from "../components/LoginShare";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Avatar, Badge, Button } from "../components/ui";
import { callAccounts, type NewLogin } from "../lib/accounts";
import { normalizePhone } from "../lib/auth";
import { addDays, diffDays, formatDate, formatPhone, initialsOf, isValidIndianMobile, todayISO } from "../lib/format";
import { supabase } from "../lib/supabase";

type Login = { user_id: string; name: string; phone: string; role: "owner" | "staff"; active: boolean; must_change_password: boolean };
type Gym = { id: string; name: string; address: string; phone: string; gstin: string; created_at: string; active: boolean; subscription_plan: string; subscription_ends_on: string | null; staff: Login[] };
type Shared = NewLogin & { name: string; gymName: string; reset: boolean };

const PLANS = ["Pilot", "Basic", "Standard", "Pro"];

/** Where a gym's subscription stands today. */
function subscription(gym: Gym, today: string) {
  if (!gym.active) return { open: false, tone: "danger", label: "Inactive" };
  if (gym.subscription_ends_on && gym.subscription_ends_on < today) return { open: false, tone: "danger", label: `Expired ${formatDate(gym.subscription_ends_on)}` };
  if (gym.subscription_ends_on) {
    const days = diffDays(gym.subscription_ends_on, today);
    return { open: true, tone: days <= 7 ? "warning" : "success", label: `Active · until ${formatDate(gym.subscription_ends_on)}` };
  }
  return { open: true, tone: "success", label: "Active · no end date" };
}

/** Messy2Easy platform admin: manage client gyms, their owners and subscriptions. */
export function AdminHome({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Gym | null>(null);
  const [deleting, setDeleting] = useState<Gym | null>(null);
  const [editingOwner, setEditingOwner] = useState<Login | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirm = useConfirm();
  const today = todayISO();

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("gyms")
      .select("id, name, address, phone, gstin, created_at, active, subscription_plan, subscription_ends_on, staff(user_id, name, phone, role, active, must_change_password)")
      .order("created_at", { ascending: false });
    if (loadError) setError("Couldn't load gyms. Check your internet connection.");
    else { setError(""); setGyms(data as Gym[]); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const fail = (e: unknown) => confirm({ title: "Something went wrong", message: (e as Error).message, alertOnly: true, danger: true, icon: "close" });

  const resetPassword = async (gym: Gym, owner: Login) => {
    if (!(await confirm({ title: `Reset ${owner.name}’s password?`, message: "Their current password will stop working. You’ll get a new temporary password to send them.", confirmLabel: "Reset password", icon: "refresh" }))) return;
    setBusyId(owner.user_id);
    try {
      const login = await callAccounts({ action: "reset_password", userId: owner.user_id });
      setShared({ ...login, name: owner.name, gymName: gym.name, reset: true });
      void load();
    } catch (e) {
      await fail(e);
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (gym: Gym) => {
    const pausing = gym.active;
    const ok = await confirm(pausing
      ? { title: `Deactivate ${gym.name}?`, message: "The owner and staff won’t be able to use the app until you activate it again. Their data stays safe.", confirmLabel: "Deactivate", danger: true, icon: "close" }
      : { title: `Activate ${gym.name}?`, message: "The owner and staff can use the app again.", confirmLabel: "Activate", icon: "check" });
    if (!ok) return;
    setBusyId(gym.id);
    const { error: saveError } = await supabase.rpc("admin_update_gym", { p_gym_id: gym.id, p_name: gym.name, p_address: gym.address, p_phone: gym.phone, p_gstin: gym.gstin, p_active: !pausing, p_subscription_plan: gym.subscription_plan, p_subscription_ends_on: gym.subscription_ends_on });
    setBusyId(null);
    if (saveError) await fail(new Error("Couldn't save. Check your internet connection."));
    void load();
  };

  return <div className="admin-shell">
    <header className="admin-topbar"><div className="login-brand static"><span className="brand-mark">M</span><span><strong>Messy2Easy</strong><small>ADMIN</small></span></div><div className="admin-user"><span>{email}</span><Button variant="secondary" onClick={async () => { if (await confirm(SIGN_OUT_CONFIRM)) onSignOut(); }}>Sign out</Button></div></header>
    <main className="page admin-page">
      <PageHeader eyebrow="MESSY2EASY ADMIN" title="Gyms" subtitle="Your client gyms, their owners and subscriptions." action={<Button icon="plus" onClick={() => setAdding(true)}>Add gym</Button>}/>
      {error && <div className="panel admin-message"><p className="form-error">{error}</p><Button variant="secondary" onClick={() => void load()}>Try again</Button></div>}
      {!gyms && !error && <div className="panel admin-message"><p>Loading gyms…</p></div>}
      {gyms && gyms.length === 0 && <div className="panel admin-message"><Icon name="building" size={28}/><h2>No gyms yet</h2><p>Add your first client gym with its owner’s mobile number.</p><Button icon="plus" onClick={() => setAdding(true)}>Add gym</Button></div>}
      <div className="admin-gyms">{gyms?.map((gym) => {
        const owners = gym.staff.filter((s) => s.role === "owner");
        const staffCount = gym.staff.filter((s) => s.role === "staff").length;
        const sub = subscription(gym, today);
        return <section className={`panel admin-gym ${sub.open ? "" : "paused"}`} key={gym.id}>
          <div className="admin-gym-head"><span className="brand-mark">{gym.name.charAt(0).toUpperCase()}</span><div><h2>{gym.name}</h2><p>{[gym.address, gym.phone].filter(Boolean).join(" · ") || "No address added"} · Added {formatDate(gym.created_at.slice(0, 10))}</p></div><Badge>{staffCount} staff</Badge></div>
          <div className="admin-sub"><Badge tone={sub.tone}>{sub.label}</Badge><span>{gym.subscription_plan} plan</span></div>
          {owners.length === 0 && <p className="form-note">No owner login for this gym.</p>}
          {owners.map((o) => <div className="staff-row" key={o.user_id}><Avatar initials={initialsOf(o.name)} color="blue" small/><span><strong>{o.name} <Badge tone="success">Owner</Badge></strong><small>+91 {formatPhone(o.phone)} · {!o.active ? "Login turned off" : o.must_change_password ? "Hasn’t logged in yet" : "Active"}</small></span><div className="owner-actions"><Button variant="ghost" icon="edit" onClick={() => setEditingOwner(o)}>Edit</Button><Button variant="secondary" onClick={() => void resetPassword(gym, o)} disabled={busyId === o.user_id}>{busyId === o.user_id ? "Resetting…" : "Reset password"}</Button></div></div>)}
          <div className="admin-gym-actions">
            <Button variant="secondary" icon="edit" onClick={() => setEditing(gym)}>Edit gym</Button>
            <Button variant={gym.active ? "secondary" : "primary"} icon={gym.active ? "close" : "check"} onClick={() => void toggleActive(gym)} disabled={busyId === gym.id}>{gym.active ? "Deactivate" : "Activate"}</Button>
            <Button variant="ghost" onClick={() => setDeleting(gym)}>Delete</Button>
          </div>
        </section>;
      })}</div>
    </main>
    {adding && <AddGymModal onClose={() => setAdding(false)} onCreated={(s) => { setAdding(false); setShared(s); void load(); }}/>}
    {editing && <EditGymModal gym={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }}/>}
    {editingOwner && <EditOwnerModal owner={editingOwner} onClose={() => setEditingOwner(null)} onSaved={() => { setEditingOwner(null); void load(); }}/>}
    {deleting && <DeleteGymModal gym={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); void load(); }}/>}
    {shared && <Modal title={shared.reset ? "New temporary password" : "Gym added"} subtitle={shared.gymName} onClose={() => setShared(null)}><LoginShare name={shared.name} gymName={shared.gymName} phone={shared.phone} temporaryPassword={shared.temporaryPassword} reset={shared.reset} onDone={() => setShared(null)}/></Modal>}
  </div>;
}

function AddGymModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Shared) => void }) {
  const [gymName, setGymName] = useState("");
  const [address, setAddress] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(ownerPhone);
    if (gymName.trim().length < 2) return setError("Enter the gym name.");
    if (ownerName.trim().length < 2) return setError("Enter the owner's name.");
    if (!isValidIndianMobile(phone)) return setError("Enter the owner's 10-digit mobile number.");
    setError("");
    setSaving(true);
    try {
      const login = await callAccounts({ action: "create_gym", gymName: gymName.trim(), address: address.trim(), gymPhone: gymPhone.trim(), ownerName: ownerName.trim(), ownerPhone: phone });
      onCreated({ ...login, name: ownerName.trim(), gymName: gymName.trim(), reset: false });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return <Modal title="Add gym" subtitle="Creates the gym and a login for its owner." onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="stack">
        <div className="field"><label htmlFor="gym-name">Gym name <i>*</i></label><input id="gym-name" value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="e.g. Wolves Arena Gym"/></div>
        <div className="field"><label htmlFor="gym-address">Address <small>Optional</small></label><input id="gym-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Area, Kanpur"/></div>
        <div className="field"><label htmlFor="gym-phone">Gym phone <small>Optional</small></label><input id="gym-phone" inputMode="tel" value={gymPhone} onChange={(e) => setGymPhone(e.target.value)}/></div>
      </div>
      <div className="form-row"><div className="field"><label htmlFor="owner-name">Owner name <i>*</i></label><input id="owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)}/></div><div className="field"><label htmlFor="owner-phone">Owner mobile <i>*</i></label><div className="phone-input"><span>+91</span><input id="owner-phone" inputMode="numeric" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="98765 43210"/></div></div></div>
      <p className="form-note">The owner logs in with this mobile number. You’ll get a temporary password to send on WhatsApp.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Add gym"}</Button></div>
    </form>
  </Modal>;
}

function EditGymModal({ gym, onClose, onSaved }: { gym: Gym; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [name, setName] = useState(gym.name);
  const [address, setAddress] = useState(gym.address);
  const [phone, setPhone] = useState(gym.phone);
  const [gstin, setGstin] = useState(gym.gstin);
  const [plan, setPlan] = useState(gym.subscription_plan);
  const [endsOn, setEndsOn] = useState(gym.subscription_ends_on ?? "");
  const [active, setActive] = useState(gym.active);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Extending starts from the current end date if it is still in the future.
  const extend = (days: number) => setEndsOn(addDays(endsOn && endsOn >= today ? endsOn : today, days));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Enter the gym name.");
    setError("");
    setSaving(true);
    const { error: saveError } = await supabase.rpc("admin_update_gym", { p_gym_id: gym.id, p_name: name.trim(), p_address: address.trim(), p_phone: phone.trim(), p_gstin: gstin.trim(), p_active: active, p_subscription_plan: plan, p_subscription_ends_on: endsOn || null });
    if (saveError) { setError("Couldn't save. Check your internet connection."); setSaving(false); return; }
    onSaved();
  };

  return <Modal title="Edit gym" subtitle={gym.name} onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="stack">
        <div className="field"><label htmlFor="edit-gym-name">Gym name <i>*</i></label><input id="edit-gym-name" value={name} onChange={(e) => setName(e.target.value)}/></div>
        <div className="field"><label htmlFor="edit-gym-address">Address</label><input id="edit-gym-address" value={address} onChange={(e) => setAddress(e.target.value)}/></div>
      </div>
      <div className="form-row"><div className="field"><label htmlFor="edit-gym-phone">Gym phone</label><input id="edit-gym-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}/></div><div className="field"><label htmlFor="edit-gym-gstin">GSTIN</label><input id="edit-gym-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)}/></div></div>
      <div className="sub-box">
        <strong>Subscription</strong>
        <div className="form-row"><div className="field"><label htmlFor="edit-plan">Plan</label><select id="edit-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select></div><div className="field"><label htmlFor="edit-ends">Valid until <small>Empty = no end date</small></label><input id="edit-ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)}/></div></div>
        <div className="filter-tabs extend-tabs"><button type="button" onClick={() => extend(30)}>+1 month</button><button type="button" onClick={() => extend(90)}>+3 months</button><button type="button" onClick={() => extend(365)}>+1 year</button><button type="button" onClick={() => setEndsOn("")}>No end date</button></div>
        <label className={`plan-option ${active ? "selected" : ""}`}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/><span><strong>Active</strong><small>{active ? "Owner and staff can use the app" : "Paused: owner and staff can’t use the app"}</small></span></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
    </form>
  </Modal>;
}

function EditOwnerModal({ owner, onClose, onSaved }: { owner: Login; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(owner.name);
  const [phone, setPhone] = useState(formatPhone(owner.phone));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = normalizePhone(phone);
    if (name.trim().length < 2) return setError("Enter the owner's name.");
    if (!isValidIndianMobile(digits)) return setError("Enter a valid 10-digit mobile number.");
    setError("");
    setSaving(true);
    try {
      await callAccounts({ action: "update_staff", userId: owner.user_id, name: name.trim(), phone: digits });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <Modal title="Edit owner" subtitle={owner.name} onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="form-row"><div className="field"><label htmlFor="owner-edit-name">Name</label><input id="owner-edit-name" value={name} onChange={(e) => setName(e.target.value)}/></div><div className="field"><label htmlFor="owner-edit-phone">Login mobile</label><div className="phone-input"><span>+91</span><input id="owner-edit-phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)}/></div></div></div>
      <p className="form-note">Changing the mobile number changes how they log in. Their password stays the same.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
    </form>
  </Modal>;
}

function DeleteGymModal({ gym, onClose, onDeleted }: { gym: Gym; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = typed.trim() === gym.name;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setDeleting(true);
    try {
      await callAccounts({ action: "delete_gym", gymId: gym.id, confirmName: typed.trim() });
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };
  return <Modal title={`Delete ${gym.name}?`} subtitle="This can’t be undone." onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="delete-warning"><Icon name="close" size={18}/><p>Deletes the gym with <strong>all its members, payments, check-ins, plans and expenses</strong>, and removes the logins of its owner and staff ({gym.staff.length}). To pause the gym instead, use <strong>Deactivate</strong>.</p></div>
      <div className="field"><label htmlFor="delete-confirm">Type <strong>{gym.name}</strong> to confirm</label><input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"/></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="danger" disabled={!matches || deleting}>{deleting ? "Deleting…" : "Delete gym"}</Button></div>
    </form>
  </Modal>;
}
