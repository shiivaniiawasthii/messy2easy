import { Icon, type IconName } from "./Icon";

export function Avatar({ initials, color = "mint", small = false }: { initials: string; color?: string; small?: boolean }) {
  return <span className={`avatar avatar-${color} ${small ? "avatar-small" : ""}`}>{initials}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Button({ children, icon, variant = "primary", onClick, type = "button", disabled = false }: { children: React.ReactNode; icon?: IconName; variant?: string; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <button className={`btn btn-${variant}`} onClick={onClick} type={type} disabled={disabled}>{icon && <Icon name={icon} size={18}/>}<span>{children}</span></button>;
}
