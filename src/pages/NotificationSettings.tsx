import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui";
import { digitsOnly, isValidIndianMobile } from "../lib/format";
import { callNotifications, CHANNEL_LABELS, logTime, type NotificationInfo, type NotificationSettings as Settings, type NotifyChannel, type SendResult, summaryStatusLine } from "../lib/notifications";
import { formatSendTime, SEND_TIMES, SUMMARY_SECTIONS, SUMMARY_WINDOWS, type SummarySection } from "../lib/summary";

const SECTION_LABELS: Record<SummarySection, [string, string]> = {
  collections: ["Today’s collections", "Total ₹, number of payments, cash vs UPI"],
  checkins: ["Today’s check-ins", "How many members came today"],
  expiring: [`Expiring in the next ${SUMMARY_WINDOWS.expiringDays} days`, "Name and end date"],
  expired: [`Expired in the last ${SUMMARY_WINDOWS.expiredDays} days`, "Not renewed yet"],
  dues: ["Pending dues", `Top ${SUMMARY_WINDOWS.topDues} members and total outstanding`],
  inactive: ["Stopped coming", `Active plan, no visit in ${SUMMARY_WINDOWS.inactiveDays}+ days`],
};
const CHANNELS: NotifyChannel[] = ["whatsapp", "email"];

/** Same rules as the server (which checks again). */
function problem(s: Settings, forTest = false) {
  if (s.whatsapp_number && !isValidIndianMobile(s.whatsapp_number)) return "Enter a valid 10-digit WhatsApp number.";
  if (s.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) return "Enter a valid email address.";
  if (!s.enabled && !forTest) return "";
  if (s.channels.length === 0) return "Choose WhatsApp, Email or both.";
  if (s.channels.includes("whatsapp") && !s.whatsapp_number) return "Enter the WhatsApp number.";
  if (s.channels.includes("email") && !s.email) return "Enter the email address.";
  if (s.included_sections.length === 0) return "Choose at least one thing to include.";
  return "";
}

const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item));

/** Settings → Notifications (owner only; the server refuses everyone else). */
export function NotificationSettings() {
  const [info, setInfo] = useState<NotificationInfo | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [saved, setSaved] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);

  const load = async () => {
    try {
      const data = await callNotifications<NotificationInfo>({ action: "get_settings" });
      setInfo(data);
      setForm((f) => f ?? data.settings);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  };
  useEffect(() => { void load(); }, []);

  if (loadError) return null;
  // Automatic WhatsApp/email summary: hidden until Messy2Easy connects a channel (see README).
  if (!info || !form || (!info.configured.whatsapp && !info.configured.email && !info.saved)) return null;

  const set = (patch: Partial<Settings>) => { setForm({ ...form, ...patch }); setSaved(false); setError(""); };
  const save = async () => {
    const p = problem(form);
    if (p) return setError(p);
    setBusy("save");
    try {
      await callNotifications({ action: "save_settings", settings: form });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };
  const sendTest = async () => {
    const p = problem(form, true);
    if (p) return setError(p);
    setBusy("test");
    setResults(null);
    setError("");
    try {
      const res = await callNotifications<{ results: SendResult[] }>({ action: "send_test", settings: form });
      setResults(res.results);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  // Latest delivery per channel
  const last = CHANNELS.map((c) => info.log.find((l) => l.channel === c)).filter((l) => !!l);
  const notReady = form.channels.filter((c) => !info.configured[c]);

  return <section className="panel settings-section notify-settings" id="settings-notifications">
    <div className="settings-title"><span className="large-icon"><Icon name="bell"/></span><div><h2>Owner notifications</h2><p>A daily summary for you on WhatsApp or email. Staff don’t get it.</p></div></div>

    <div className="plan-options notify-switch"><label className={`plan-option ${form.enabled ? "selected" : ""}`}><input id="notify-enabled" type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })}/><span><strong>Daily summary</strong><small>{form.enabled ? `On · every day at ${formatSendTime(form.send_time)} (India time)` : "Off · turn on to get a summary every day"}</small></span></label></div>

    <h3 className="notify-heading">Send by</h3>
    <div className="plan-options notify-channels">{CHANNELS.map((c) => <label key={c} className={`plan-option ${form.channels.includes(c) ? "selected" : ""}`}><input id={`notify-channel-${c}`} type="checkbox" checked={form.channels.includes(c)} onChange={(e) => set({ channels: toggle(form.channels, c, e.target.checked) })}/><span><strong>{CHANNEL_LABELS[c]}</strong><small>{info.configured[c] ? (c === "whatsapp" ? "Message on your WhatsApp" : "Email with a button to the app") : "Not connected yet"}</small></span></label>)}</div>
    {notReady.length > 0 && <p className="notify-warning"><Icon name="clock" size={15}/>{notReady.map((c) => CHANNEL_LABELS[c]).join(" and ")} {notReady.length > 1 ? "are" : "is"} not connected yet. Messy2Easy will set {notReady.length > 1 ? "them" : "it"} up.{notReady.includes("whatsapp") && !form.channels.includes("email") && " Add an email address and it will be used instead until then."}</p>}

    <div className="form-grid notify-fields">
      <div className="field"><label htmlFor="notify-whatsapp-number">WhatsApp number</label><div className="phone-input"><span>+91</span><input id="notify-whatsapp-number" inputMode="numeric" maxLength={10} value={form.whatsapp_number} onChange={(e) => set({ whatsapp_number: digitsOnly(e.target.value).slice(-10) })} placeholder="98765 43210"/></div></div>
      <div className="field"><label htmlFor="notify-email">Email address</label><input id="notify-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value.trim() })} placeholder="owner@example.com"/></div>
      <div className="field"><label htmlFor="notify-time">Send time <small>India time (IST)</small></label><select id="notify-time" value={form.send_time} onChange={(e) => set({ send_time: e.target.value })}>{SEND_TIMES.map((t) => <option key={t} value={t}>{formatSendTime(t)}</option>)}</select></div>
    </div>

    <h3 className="notify-heading">Include in the summary</h3>
    <div className="plan-options notify-sections">{SUMMARY_SECTIONS.map((id) => <label key={id} className={`plan-option ${form.included_sections.includes(id) ? "selected" : ""}`}><input type="checkbox" checked={form.included_sections.includes(id)} onChange={(e) => set({ included_sections: SUMMARY_SECTIONS.filter((s) => (s === id ? e.target.checked : form.included_sections.includes(s))) })}/><span><strong>{SECTION_LABELS[id][0]}</strong><small>{SECTION_LABELS[id][1]}</small></span></label>)}</div>

    <div className="notify-status">
      <strong>{summaryStatusLine(info.settings)}{!info.saved && " · not saved yet"}</strong>
      {last.length === 0 ? <small>Last sent: nothing sent yet</small> : <small>Last sent: {last.map((l) => <span key={l.channel} className={l.status === "failed" ? "danger-text" : ""}>{CHANNEL_LABELS[l.channel]} {l.status === "sent" ? "✓" : l.status === "failed" ? "✗ failed" : "sending…"} · {logTime(l.sent_at ?? l.created_at)}{l.kind === "test" ? " (test)" : ""}{l.fallback_for ? " (instead of WhatsApp)" : ""}{l.status === "failed" && l.error ? ` — ${l.error}` : ""}</span>)}</small>}
    </div>

    {results && <div className="notify-results">{results.map((r, i) => <p key={i} className={r.status === "failed" ? "form-error" : "green-text notify-ok"}>{r.status === "sent" ? "✓" : r.status === "skipped" ? "–" : "✗"} {CHANNEL_LABELS[r.channel]}{r.fallback ? " (instead of WhatsApp)" : ""}: {r.status === "sent" ? "test summary sent" : r.status === "skipped" ? "already sent today" : r.error}</p>)}</div>}
    {error && <p className="form-error">{error}</p>}
    <div className="section-save"><Button variant="secondary" icon="message" onClick={sendTest} disabled={!!busy}>{busy === "test" ? "Sending…" : "Send test summary now"}</Button><Button onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : saved ? "Saved" : "Save changes"}</Button></div>
  </section>;
}
