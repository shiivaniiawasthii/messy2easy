import { useState } from "react";
import { formatPhone } from "../lib/format";
import { loginMessage, whatsappLink } from "../lib/accounts";
import { Icon } from "./Icon";
import { Button } from "./ui";

/** Shows a temporary password once, with WhatsApp and Copy buttons. */
export function LoginShare({ name, gymName, phone, temporaryPassword, reset = false, onDone }: { name: string; gymName: string; phone: string; temporaryPassword: string; reset?: boolean; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = loginMessage({ name, gymName, phone, temporaryPassword, reset });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this message:", message);
    }
  };
  return <div className="modal-success login-share">
    <span className="success-icon"><Icon name="check" size={28}/></span>
    <strong>{reset ? "Password reset" : "Login created"} for {name}</strong>
    <p>Send these details to them now. The temporary password is shown only once.</p>
    <div className="share-details">
      <span>Login mobile<b>{formatPhone(phone)}</b></span>
      <span>Temporary password<b className="mono">{temporaryPassword}</b></span>
    </div>
    <a className="btn btn-primary" href={whatsappLink(phone, message)} target="_blank" rel="noopener noreferrer"><Icon name="message" size={18}/><span>Send on WhatsApp</span></a>
    <Button variant="secondary" icon="download" onClick={copy}>{copied ? "Copied" : "Copy message"}</Button>
    <Button variant="ghost" onClick={onDone}>Done</Button>
  </div>;
}
