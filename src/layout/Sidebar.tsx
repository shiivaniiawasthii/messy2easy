import { SIGN_OUT_CONFIRM, useConfirm } from "../components/Confirm";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import { diffDays, formatDate, initialsOf } from "../lib/format";
import { gymLogoUrl } from "../lib/logo";
import { isExpiringSoon, plural } from "../lib/members";
import { navFor, navScreen, type Screen } from "../navigation";
import { useStore } from "../store/store";

export function Sidebar({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const { data, today, account, signOut } = useStore();
  const items = navFor(account.role);
  const confirm = useConfirm();
  const renewalsDue = data.members.filter((m) => isExpiringSoon(m, today)).length;
  return <aside className="sidebar">
    <button className="brand" onClick={() => setScreen("dashboard")}>{data.gym.logoPath ? <img className="brand-logo" src={gymLogoUrl(data.gym.logoPath)} alt=""/> : <span className="brand-mark">{data.gym.name.trim().charAt(0).toUpperCase() || "G"}</span>}<span><strong title={data.gym.name}>{data.gym.name}</strong><small>by Messy2Easy</small></span></button>
    <nav className="side-nav">
      <div className="nav-label">Workspace</div>
      {items.filter((item) => item.section === "workspace").map((item) => <button key={item.id} className={`nav-item ${navScreen(screen) === item.id ? "active" : ""}`} onClick={() => setScreen(item.id)}><Icon name={item.icon}/><span>{item.label}</span>{item.id === "renewals" && renewalsDue > 0 && <em>{renewalsDue}</em>}</button>)}
      <div className="nav-label nav-space">Manage</div>
      {items.filter((item) => item.section === "manage").map((item) => <button key={item.id} className={`nav-item ${navScreen(screen) === item.id ? "active" : ""}`} onClick={() => setScreen(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}
    </nav>
    {(() => { const ends = data.gym.subscriptionEndsOn; const left = ends ? Math.max(0, diffDays(ends, today) + 1) : null; return <div className={`trial-card ${left !== null && left <= 7 ? "ending" : ""}`}><div className="trial-row"><Icon name="sparkles" size={17}/><strong>{data.gym.subscriptionPlan} plan</strong></div><p>{left === null ? "Active" : `${plural(left, "day")} remaining`}</p>{left !== null && <div className="progress"><span style={{width: `${Math.min(100, Math.round((left / 30) * 100))}%`}}/></div>}<small>{ends ? `Valid until ${formatDate(ends)}` : "Messy2Easy Solutions"}</small></div>; })()}
    <button className="user-card" onClick={async () => { if (await confirm(SIGN_OUT_CONFIRM)) signOut(); }} title="Sign out"><Avatar initials={initialsOf(account.name || "?")} color="blue" small/><span><strong>{account.name || "Staff"}</strong><small>{account.role === "owner" ? "Owner" : "Staff"} · Sign out</small></span><Icon name="more" size={18}/></button>
  </aside>;
}
