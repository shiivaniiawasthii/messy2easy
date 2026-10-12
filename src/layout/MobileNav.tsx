import { SIGN_OUT_CONFIRM, useConfirm } from "../components/Confirm";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { isExpiringSoon } from "../lib/members";
import { navFor, navScreen, type Screen } from "../navigation";
import { useStore } from "../store/store";

export const moreDescriptions: Partial<Record<Screen, string>> = { earnings: "Income, expenses and profit", renewals: "Expiring and expired memberships", plans: "Membership plans and prices", settings: "Gym details and staff" };

export function MobileNav({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const { data, today, account, signOut } = useStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = navFor(account.role);
  const confirm = useConfirm();
  // Owners also get Earnings in the bottom bar (it's the first thing they look for).
  const inBar = account.role === "owner" ? 5 : 4;
  const main = items.slice(0, inBar);
  const more = items.slice(inBar);
  const moreActive = more.some((item) => item.id === navScreen(screen));
  const renewalsDue = data.members.filter((m) => isExpiringSoon(m, today)).length;
  const open = (s: Screen) => { setMoreOpen(false); setScreen(s); };
  return <>
    <nav className="mobile-nav">{main.map((item) => <button className={navScreen(screen) === item.id ? "active" : ""} key={item.id} onClick={() => setScreen(item.id)}><Icon name={item.icon}/><span>{item.short ?? item.label}</span></button>)}<button className={moreActive ? "active" : ""} onClick={() => setMoreOpen(true)} aria-haspopup="dialog"><Icon name="more"/><span>More</span>{renewalsDue > 0 && <i className="nav-dot"/>}</button></nav>
    {moreOpen && <Modal title="More" onClose={() => setMoreOpen(false)}><div className="modal-body more-menu">{more.map((item) => <button key={item.id} className={`more-item ${navScreen(screen) === item.id ? "active" : ""}`} onClick={() => open(item.id)}><span className="stat-icon"><Icon name={item.icon} size={19}/></span><span><strong>{item.label}</strong><small>{moreDescriptions[item.id]}</small></span>{item.id === "renewals" && renewalsDue > 0 && <em>{renewalsDue}</em>}<Icon name="chevron" size={18}/></button>)}<button className="more-item" onClick={async () => { setMoreOpen(false); if (await confirm(SIGN_OUT_CONFIRM)) signOut(); }}><span className="stat-icon stat-rose"><Icon name="arrow" size={19}/></span><span><strong>Sign out</strong><small>{account.name || "Staff"}</small></span></button></div></Modal>}
  </>;
}
