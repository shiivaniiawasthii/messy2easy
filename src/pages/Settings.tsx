import { useState } from "react";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Badge, Button } from "../components/ui";
import { db } from "../data/db";
import { type GymProfile } from "../data/types";
import { useStore } from "../store/store";
import { NotificationSettings } from "./NotificationSettings";
import { TeamSection } from "./TeamSection";

export type SettingsSection = "gym" | "staff" | "notifications";

export function Settings({ initialSection = "gym" }: { initialSection?: SettingsSection }) {
  const { data, reload } = useStore();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [gym, setGym] = useState<GymProfile>(data.gym);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (gym.name.trim().length < 2) return setError("Gym name is required.");
    setError("");
    setSaving(true);
    try {
      await db.saveGym({ name: gym.name.trim(), address: gym.address.trim(), phone: gym.phone.trim(), gstin: gym.gstin.trim().toUpperCase() });
      await reload();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return <div className="page"><PageHeader eyebrow="SETTINGS" title="Gym & team settings" subtitle="Manage access, gym details, and preferences."/>
    <div className="settings-layout"><aside className="settings-nav">{([["gym", "building", "Gym profile"], ["staff", "users", "Staff & roles"], ["notifications", "bell", "Notifications"]] as const).map(([id, icon, label]) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)} aria-pressed={section === id}><Icon name={icon}/>{label}</button>)}</aside><div className="settings-content">
      {section === "gym" && <section className="panel settings-section" id="settings-gym"><div className="settings-title"><span className="large-icon"><Icon name="building"/></span><div><h2>Gym profile</h2><p>Visible to your staff.</p></div></div><div className="form-grid"><div className="field span-2"><label htmlFor="gym-name">Gym name</label><input id="gym-name" value={gym.name} onChange={(e) => setGym({ ...gym, name: e.target.value })}/></div><div className="field span-2"><label htmlFor="gym-address">Address</label><input id="gym-address" value={gym.address} onChange={(e) => setGym({ ...gym, address: e.target.value })}/></div><div className="field"><label htmlFor="gym-phone">Phone</label><input id="gym-phone" value={gym.phone} onChange={(e) => setGym({ ...gym, phone: e.target.value })}/></div><div className="field"><label htmlFor="gym-gstin">GSTIN <small>Optional</small></label><input id="gym-gstin" value={gym.gstin} onChange={(e) => setGym({ ...gym, gstin: e.target.value })} placeholder="Enter GSTIN"/></div></div>{error && <p className="form-error">{error}</p>}<div className="section-save"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved" : "Save changes"}</Button></div></section>}
      {section === "staff" && <TeamSection/>}
      {section === "notifications" && <NotificationSettings/>}
    </div></div>
  </div>;
}
