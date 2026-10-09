import { SIGN_OUT_CONFIRM, useConfirm } from "../components/Confirm";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { LoginShare } from "../components/LoginShare";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Avatar, Badge, Button } from "../components/ui";
import { callAccounts, type NewLogin } from "../lib/accounts";
import { normalizePhone } from "../lib/auth";
import { formatDate, formatPhone, initialsOf, isValidIndianMobile } from "../lib/format";
import { supabase } from "../lib/supabase";

type Owner = { user_id: string; name: string; phone: string; role: "owner" | "staff"; active: boolean; must_change_password: boolean };
type Gym = { id: string; name: string; address: string; phone: string; created_at: string; staff: Owner[] };
type Shared = NewLogin & { name: string; gymName: string; reset: boolean };

/** Messy2Easy platform admin: list gyms, add a gym with its owner, reset owner passwords. */
export function AdminHome({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [shared, setShared] = useState<Shared | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("gyms")
      .select("id, name, address, phone, created_at, staff(user_id, name, phone, role, active, must_change_password)")
      .order("created_at", { ascending: false });
    if (loadError) setError("Couldn't load gyms. Check your internet connection.");
    else { setError(""); setGyms(data as Gym[]); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resetPassword = async (gym: Gym, owner: Owner) => {
    if (!(await confirm({ title: `Reset ${owner.name}’s password?`, message: "Their current password will stop working. You’ll get a new temporary password to send them.", confirmLabel: "Reset password", icon: "refresh" }))) return;
    setBusyId(owner.user_id);
    try {
      const login = await callAccounts({ action: "reset_password", userId: owner.user_id });
      setShared({ ...login, name: owner.name, gymName: gym.name, reset: true });
      void load();
    } catch (e) {
      await confirm({ title: "Couldn’t reset the password", message: (e as Error).message, alertOnly: true, icon: "close", danger: true });
    } finally {
      setBusyId(null);
    }
  };

  return <div className="admin-shell">
    <header className="admin-topbar"><div className="login-brand static"><span className="brand-mark">M</span><span><strong>Messy2Easy</strong><small>ADMIN</small></span></div><div className="admin-user"><span>{email}</span><Button variant="secondary" onClick={async () => { if (await confirm(SIGN_OUT_CONFIRM)) onSignOut(); }}>Sign out</Button></div></header>
    <main className="page admin-page">
      <PageHeader eyebrow="MESSY2EASY ADMIN" title="Gyms" subtitle="Add a gym and its owner. The owner then adds their own staff." action={<Button icon="plus" onClick={() => setAdding(true)}>Add gym</Button>}/>
      {error && <div className="panel admin-message"><p className="form-error">{error}</p><Button variant="secondary" onClick={() => void load()}>Try again</Button></div>}
      {!gyms && !error && <div className="panel admin-message"><p>Loading gyms…</p></div>}
      {gyms && gyms.length === 0 && <div className="panel admin-message"><Icon name="building" size={28}/><h2>No gyms yet</h2><p>Add your first gym, for example Wolves Arena Gym, with its owner’s mobile number.</p><Button icon="plus" onClick={() => setAdding(true)}>Add gym</Button></div>}
      <div className="admin-gyms">{gyms?.map((gym) => {
        const owners = gym.staff.filter((s) => s.role === "owner");
        const staffCount = gym.staff.filter((s) => s.role === "staff").length;
        return <section className="panel admin-gym" key={gym.id}>
          <div className="admin-gym-head"><span className="brand-mark">{gym.name.charAt(0).toUpperCase()}</span><div><h2>{gym.name}</h2><p>{[gym.address, gym.phone].filter(Boolean).join(" · ") || "No address added"} · Added {formatDate(gym.created_at.slice(0, 10))}</p></div><Badge>{staffCount} staff</Badge></div>
          {owners.length === 0 && <p className="form-note">No owner login for this gym.</p>}
          {owners.map((o) => <div className="staff-row" key={o.user_id}><Avatar initials={initialsOf(o.name)} color="blue" small/><span><strong>{o.name} <Badge tone="success">Owner</Badge></strong><small>+91 {formatPhone(o.phone)} · {!o.active ? "Login turned off" : o.must_change_password ? "Hasn’t logged in yet" : "Active"}</small></span><Button variant="secondary" onClick={() => void resetPassword(gym, o)} disabled={busyId === o.user_id}>{busyId === o.user_id ? "Resetting…" : "Reset password"}</Button></div>)}
        </section>;
      })}</div>
    </main>
    {adding && <AddGymModal onClose={() => setAdding(false)} onCreated={(s) => { setAdding(false); setShared(s); void load(); }}/>}
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
