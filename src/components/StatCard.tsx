import { Icon, type IconName } from "./Icon";

export function StatCard({ label, value, detail, icon, tone = "green", onClick }: { label: string; value: string; detail: React.ReactNode; icon: IconName; tone?: string; onClick?: () => void }) {
  return <button className="stat-card" onClick={onClick}><div className="stat-head"><span>{label}</span><span className={`stat-icon stat-${tone}`}><Icon name={icon} size={20}/></span></div><strong>{value}</strong><div className="stat-detail">{detail}</div></button>;
}
