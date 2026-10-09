import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../components/Confirm";
import { Icon } from "../components/Icon";
import { LoginShare } from "../components/LoginShare";
import { Modal } from "../components/Modal";
import { Avatar, Badge, Button } from "../components/ui";
import { callAccounts } from "../lib/accounts";
import { normalizePhone, type Role } from "../lib/auth";
import { formatPhone, initialsOf, isValidIndianMobile } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useStore } from "../store/store";

type TeamMember = { user_id: string; name: string; phone: string; role: Role; active: boolean; must_change_password: boolean };
type Shared = { name: string; phone: string; temporaryPassword: string; reset: boolean };

const roleText = (role: Role) => (role === "owner" ? "Full access" : "Check-ins, members & payments");

/** Owner's team: real logins from the database, invited with a temporary password sent on WhatsApp. */
export function TeamSection() {
  const { account } = useStore();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [gymName, setGymName] = useState("");
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState<TeamMember | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);

  const load = useCallback(async () => {
    const [staff, gym] = await Promise.all([
      supabase.from("staff").select("user_id, name, phone, role, active, must_change_password").order("created_at"),
      supabase.from("gyms").select("name").maybeSingle(),
    ]);
    if (staff.error || gym.error) return setError("Couldn't load your team. Check your internet connection.");
    setError("");
    setTeam(staff.data as TeamMember[]);
    setGymName(gym.data?.name ?? "");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const owners = team?.filter((m) => m.role === "owner" && m.active).length ?? 0;

  return <section className="panel settings-section" id="settings-staff">
    <div className="panel-head"><div><h2>Staff access</h2><p>{team ? `${team.length} ${team.length === 1 ? "person" : "people"} can log in to this gym` : "Loading…"}</p></div><Button variant="secondary" icon="plus" onClick={() => setInviting(true)}>Invite staff</Button></div>
    {error && <div className="team-error"><p className="form-error">{error}</p><Button variant="secondary" onClick={() => void load()}>Try again</Button></div>}
    {team?.map((m) => <div className="staff-row" key={m.user_id}>
      <Avatar initials={initialsOf(m.name)} color={m.role === "owner" ? "blue" : "amber"} small/>
      <span><strong>{m.name} {m.user_id === account.userId && <Badge>You</Badge>}</strong><small>{roleText(m.role)} · +91 {formatPhone(m.phone)} · {!m.active ? "Login turned off" : m.must_change_password ? "Hasn’t logged in yet" : "Active"}</small></span>
      <Badge tone={m.role === "owner" ? "success" : "neutral"}>{m.role === "owner" ? "Owner" : "Staff"}</Badge>
      <button className="icon-button" onClick={() => setManaging(m)} aria-label={`Manage ${m.name}`}><Icon name="more"/></button>
    </div>)}
    <p className="form-note staff-note"><Icon name="shield" size={15}/> Everyone logs in with their own mobile number and password. Owners see everything; Staff handle check-ins, members and payments, but can’t see earnings or edit payments.</p>
    {inviting && <InviteModal gymName={gymName} onClose={() => setInviting(false)} onInvited={(s) => { setInviting(false); setShared(s); void load(); }}/>}
    {managing && <ManageModal member={managing} isSelf={managing.user_id === account.userId} isLastOwner={managing.role === "owner" && owners <= 1} onClose={() => setManaging(null)} onChanged={() => { setManaging(null); void load(); }} onReset={(s) => { setManaging(null); setShared(s); void load(); }}/>}
    {shared && <Modal title={shared.reset ? "New temporary password" : "Staff invited"} subtitle={gymName} onClose={() => setShared(null)}><LoginShare name={shared.name} gymName={gymName} phone={shared.phone} temporaryPassword={shared.temporaryPassword} reset={shared.reset} onDone={() => setShared(null)}/></Modal>}
  </section>;
}

function InviteModal({ gymName, onClose, onInvited }: { gymName: string; onClose: () => void; onInvited: (s: Shared) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = normalizePhone(phone);
    if (name.trim().length < 2) return setError("Enter their name.");
    if (!isValidIndianMobile(digits)) return setError("Enter a valid 10-digit mobile number.");
    setError("");
    setSaving(true);
    try {
      const login = await callAccounts({ action: "add_staff", name: name.trim(), phone: digits, role });
      onInvited({ name: name.trim(), phone: login.phone, temporaryPassword: login.temporaryPassword, reset: false });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return <Modal title="Invite staff" subtitle={`Creates a login for ${gymName || "your gym"}.`} onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="invite-name">Name <i>*</i></label><input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rohit Singh"/></div>
      <div className="form-row"><div className="field"><label htmlFor="invite-phone">Mobile number <i>*</i></label><div className="phone-input"><span>+91</span><input id="invite-phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210"/></div></div><div className="field"><label htmlFor="invite-role">Role</label><select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="staff">Staff — check-ins & payments</option><option value="owner">Owner — full access</option></select></div></div>
      <p className="form-note">They log in with this mobile number. You’ll get a temporary password to send on WhatsApp.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating login…" : "Invite"}</Button></div>
    </form>
  </Modal>;
}

function ManageModal({ member, isSelf, isLastOwner, onClose, onChanged, onReset }: { member: TeamMember; isSelf: boolean; isLastOwner: boolean; onClose: () => void; onChanged: () => void; onReset: (s: Shared) => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<Role>(member.role);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try { await fn(); } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Enter their name.");
    void run(async () => {
      const { error: updateError } = await supabase.from("staff").update({ name: name.trim(), role }).eq("user_id", member.user_id);
      if (updateError) throw new Error(isSelf ? "You can't change your own role." : "Couldn't save. Try again.");
      onChanged();
    });
  };
  const reset = async () => {
    if (!(await confirm({ title: `Reset ${member.name}’s password?`, message: "Their current password will stop working. You’ll get a new temporary password to send them.", confirmLabel: "Reset password", icon: "refresh" }))) return;
    void run(async () => {
      const login = await callAccounts({ action: "reset_password", userId: member.user_id });
      onReset({ name: member.name, phone: login.phone, temporaryPassword: login.temporaryPassword, reset: true });
    });
  };
  const remove = async () => {
    if (!(await confirm({ title: `Remove ${member.name}?`, message: "Their login is deleted straight away. Payments and check-ins they recorded stay in your records.", confirmLabel: "Remove", danger: true, icon: "users" }))) return;
    void run(async () => {
      await callAccounts({ action: "remove_staff", userId: member.user_id });
      onChanged();
    });
  };

  return <Modal title={isSelf ? "Your login" : `Manage ${member.name}`} subtitle={`+91 ${formatPhone(member.phone)}`} onClose={onClose}>
    <form onSubmit={save} noValidate>
      <div className="form-row"><div className="field"><label htmlFor="manage-name">Name</label><input id="manage-name" value={name} onChange={(e) => setName(e.target.value)}/></div><div className="field"><label htmlFor="manage-role">Role</label><select id="manage-role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}><option value="staff">Staff — check-ins & payments</option><option value="owner">Owner — full access</option></select></div></div>
      <p className="form-note">{isSelf ? "You can’t change your own role or remove yourself." : "To change the mobile number, remove this login and invite them again."}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!isSelf && <div className="manage-actions"><Button variant="secondary" icon="refresh" onClick={reset} disabled={busy}>Reset password</Button>{!isLastOwner && <Button variant="ghost" onClick={remove} disabled={busy}>Remove login</Button>}</div>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
    </form>
  </Modal>;
}
