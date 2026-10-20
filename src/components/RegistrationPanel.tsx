import { useState } from "react";
import { db } from "../data/db";
import { memberStatus } from "../lib/members";
import { registrationLink, registrationMessage, whatsappShareLink } from "../lib/registration";
import { useStore } from "../store/store";
import { useConfirm } from "./Confirm";
import { Icon } from "./Icon";
import { Button } from "./ui";

/** Owner dashboard: the gym's public registration link and what came in through it. */
export function RegistrationPanel() {
  const { data, today, reload, openMembers } = useStore();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const token = data.gym.registrationToken;
  const link = token ? registrationLink(token) : "";
  const registered = data.members.filter((m) => m.source === "form");
  const pending = registered.filter((m) => memberStatus(m, today) === "Pending").length;

  const setLink = async (on: boolean) => {
    setError("");
    setSaving(true);
    try {
      await db.setRegistrationLink(on);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const newLink = async () => {
    if (await confirm({ title: "Make a new link?", message: "The current link will stop working. People who already have it will need the new one.", confirmLabel: "Make new link", icon: "refresh" })) void setLink(true);
  };
  const turnOff = async () => {
    if (await confirm({ title: "Turn off the registration link?", message: "Nobody can register with it until you create a new link. Members who already registered stay in your list.", confirmLabel: "Turn off", danger: true, icon: "close" })) void setLink(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", link);
    }
  };

  const stats: [string, number, () => void][] = [
    ["Registrations", registered.length, () => openMembers({ source: "Registration form" })],
    ["Pending activation", pending, () => openMembers({ status: "Pending" })],
    ["Activated", registered.length - pending, () => openMembers({ source: "Registration form", status: "Active" })],
  ];
  return <section className="panel registration-panel">
    <div className="panel-head"><div><h2>Member registration form</h2><p>Share this link. New members fill in their own details, and you only choose the plan and take the payment.</p></div></div>
    {token ? <>
      <div className="reg-link"><Icon name="shield" size={16}/><input readOnly value={link} aria-label="Registration link" onFocus={(e) => e.target.select()}/></div>
      <div className="reg-actions">
        <Button icon="check" onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
        <a className="btn btn-secondary" href={whatsappShareLink(registrationMessage(data.gym.name, link))} target="_blank" rel="noopener noreferrer"><Icon name="message" size={18}/><span>Share on WhatsApp</span></a>
        <a className="btn btn-secondary" href={link} target="_blank" rel="noopener noreferrer"><Icon name="arrow" size={18}/><span>Open form</span></a>
      </div>
    </> : <div className="reg-empty"><p>No link yet. Create one, then send it on WhatsApp or put it on a poster at the front desk.</p><Button icon="plus" onClick={() => void setLink(true)} disabled={saving}>{saving ? "Creating…" : "Create registration link"}</Button></div>}
    {error && <p className="form-error">{error}</p>}
    {(token || registered.length > 0) && <div className="reg-stats">{stats.map(([label, value, onClick]) => <button key={label} onClick={onClick}><span>{label}</span><strong className={label === "Pending activation" && value > 0 ? "amber-text" : ""}>{value}</strong></button>)}</div>}
    {pending > 0 && <p className="field-help">{pending === 1 ? "1 person is" : `${pending} people are`} waiting. Open them, choose a plan and record the payment to start their membership.</p>}
    {token && <div className="reg-manage"><button className="text-btn" onClick={() => void newLink()} disabled={saving}><Icon name="refresh" size={14}/> Make a new link</button><button className="text-btn danger-text" onClick={() => void turnOff()} disabled={saving}><Icon name="close" size={14}/> Turn off link</button></div>}
  </section>;
}
