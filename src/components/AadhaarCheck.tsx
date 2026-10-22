import { useState } from "react";
import { db } from "../data/db";
import { type AadhaarStatus, type Member } from "../data/types";
import { whatsappLink } from "../lib/accounts";
import { formatDateLong } from "../lib/format";
import { useStore } from "../store/store";
import { useConfirm } from "./Confirm";
import { Icon } from "./Icon";
import { Badge, Button } from "./ui";

export const AADHAAR_STATUS: Record<AadhaarStatus, [string, string]> = {
  none: ["No Aadhaar uploaded", "neutral"],
  pending: ["Aadhaar to check", "warning"],
  verified: ["Aadhaar verified", "success"],
  rejected: ["Wrong document", "danger"],
};

/** Opens the member's Aadhaar copy (owner only) in a new tab with a 1-minute link. */
export function useAadhaarViewer(path: string) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const open = async () => {
    setError("");
    setOpening(true);
    // Opened before the await so phone browsers don't block it as a pop-up.
    const tab = window.open("", "_blank");
    try {
      const url = await db.aadhaarUrl(path);
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    } finally {
      setOpening(false);
    }
  };
  return { open, opening, error };
}

/**
 * Profile → Membership card of a registration waiting for the Aadhaar check.
 * Owner: view the Aadhaar, mark it valid (starts the membership when due) or wrong (ask for the right one).
 * Staff: told that the owner checks it.
 */
export function AadhaarCheck({ member }: { member: Member }) {
  const { account, data, today, reload, openRenew } = useStore();
  const confirm = useConfirm();
  const viewer = useAadhaarViewer(member.aadhaarPath);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [label, tone] = AADHAAR_STATUS[member.aadhaarStatus];
  if (account.role !== "owner") return <div className="aadhaar-check"><Badge tone={tone}>{label}</Badge><p className="field-help">The membership starts after the gym owner checks this member’s Aadhaar.</p></div>;

  const start = member.intake.startDate;
  const mark = async (valid: boolean) => {
    const ok = valid
      ? await confirm({ title: "Aadhaar is valid?", message: `Confirm that this is ${member.name}’s Aadhaar card and the details match. Next, enter the fee: the plan${start ? `, start date (${start <= today ? "today" : formatDateLong(start)})` : ""} and payment method come from their form.`, confirmLabel: "Yes, valid", icon: "check" })
      : await confirm({ title: "Wrong document?", message: "The membership stays on hold. Ask them for the right Aadhaar; you can mark it valid after checking the original at the desk.", confirmLabel: "Mark as wrong", danger: true, icon: "close" });
    if (!ok) return;
    setError("");
    setSaving(true);
    try {
      const result = await db.checkAadhaar(member.id, valid);
      await reload();
      if (result === "verified") openRenew(member.id); // next step: enter the fee to start the membership
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const askAgain = `Hi ${member.name.split(" ")[0]} 🙏\nThe document you uploaded on the ${data.gym.name} registration form is not a valid Aadhaar card. Please bring your original Aadhaar card when you visit the gym so we can start your membership.`;

  return <div className="aadhaar-check">
    <Badge tone={tone}>{label}</Badge>
    <p className="field-help">{member.aadhaarStatus === "rejected" ? "Marked as the wrong document. Ask for the right Aadhaar, check the original at the desk, then mark it valid." : member.aadhaarPath ? "Open the Aadhaar and check the name, photo and date of birth before starting the membership." : "No file was uploaded. Check the original card at the desk."}</p>
    <div className="aadhaar-actions">
      {member.aadhaarPath && <Button variant="secondary" icon="shield" onClick={() => void viewer.open()} disabled={viewer.opening}>{viewer.opening ? "Opening…" : "View Aadhaar"}</Button>}
      <Button icon="check" onClick={() => void mark(true)} disabled={saving}>{saving ? "Saving…" : "Aadhaar valid"}</Button>
      {member.aadhaarStatus !== "rejected" && <Button variant="ghost" icon="close" onClick={() => void mark(false)} disabled={saving}>Wrong document</Button>}
      {member.aadhaarStatus === "rejected" && <a className="btn btn-secondary" href={whatsappLink(member.phone, askAgain)} target="_blank" rel="noopener noreferrer"><Icon name="message" size={18}/><span>Ask on WhatsApp</span></a>}
    </div>
    {(error || viewer.error) && <p className="form-error">{error || viewer.error}</p>}
  </div>;
}
