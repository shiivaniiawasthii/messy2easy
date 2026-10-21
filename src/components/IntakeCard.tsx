import { useState } from "react";
import { db } from "../data/db";
import { type Member } from "../data/types";
import { formatDateLong } from "../lib/format";
import { ageOn, INTAKE_SECTIONS, JOIN_PAYMENTS, memberNeeds } from "../lib/intake";
import { useStore } from "../store/store";
import { Icon } from "./Icon";
import { Badge, Button } from "./ui";

/** Member profile: joining-form answers, what they chose when registering, and (owner) the Aadhaar copy. */
export function IntakeCard({ member }: { member: Member }) {
  const { account, today } = useStore();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const isOwner = account.role === "owner";
  const a = member.intake;
  const tags = memberNeeds(a);
  const rows: [string, string][] = [];
  const age = ageOn(member.dob, today);
  if (age) rows.push(["Age", `${age} years`]);
  if (member.pending && a.planName) rows.push(["Chosen plan", a.planName]);
  if (member.pending && a.startDate) rows.push(["Wants to start", formatDateLong(a.startDate)]);
  if (member.pending && a.payment) rows.push(["Will pay by", JOIN_PAYMENTS.find(([v]) => v === a.payment)?.[1] ?? a.payment]);
  if (a.weight !== undefined) rows.push(["Weight", `${a.weight} kg`]);
  INTAKE_SECTIONS.forEach((s) => s.questions.forEach((q) => {
    const v = a[q.key];
    if (v !== undefined && v !== "") rows.push([q.short, typeof v === "boolean" ? (v ? "Yes" : "No") : v]);
  }));
  if (a.comments) rows.push(["Comments", a.comments]);
  if (tags.length === 0 && rows.length === 0 && !member.aadhaarPath) return null;

  const openAadhaar = async () => {
    setError("");
    setOpening(true);
    // Opened before the await so phone browsers don't block it as a pop-up.
    const tab = window.open("", "_blank");
    try {
      const url = await db.aadhaarUrl(member.aadhaarPath);
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    } finally {
      setOpening(false);
    }
  };

  return <section className="panel detail-card intake-card">
    <div className="panel-head"><h2>Fitness & health</h2></div>
    {tags.length > 0 && <div className="need-tags intake-tags">{tags.map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}</div>}
    {rows.length > 0 && <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    {member.aadhaarPath && <div className="aadhaar-row">
      <span><Icon name="shield" size={16}/> Aadhaar copy on file</span>
      {isOwner ? <Button variant="secondary" onClick={() => void openAadhaar()} disabled={opening}>{opening ? "Opening…" : "View Aadhaar"}</Button> : <small>Only the owner can open it</small>}
    </div>}
    {error && <p className="form-error">{error}</p>}
  </section>;
}
