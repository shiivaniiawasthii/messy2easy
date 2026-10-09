import { type IconName } from "./components/Icon";
import { type Role } from "./lib/auth";

export type Screen =
  | "dashboard"
  | "members"
  | "plans"
  | "payments"
  | "attendance"
  | "renewals"
  | "settings"
  | "profile"
  | "member-form"
  | "member-payments"
  | "earnings";

type NavItem = { id: Screen; label: string; icon: IconName; section: "workspace" | "manage"; ownerOnly?: boolean };

export const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "home", section: "workspace" },
  { id: "members", label: "Members", icon: "users", section: "workspace" },
  { id: "attendance", label: "Attendance", icon: "check", section: "workspace" },
  { id: "payments", label: "Payments", icon: "card", section: "workspace" },
  { id: "earnings", label: "Earnings", icon: "chart", section: "workspace", ownerOnly: true },
  { id: "renewals", label: "Renewals", icon: "refresh", section: "workspace" },
  { id: "plans", label: "Plans", icon: "calendar", section: "manage" },
  { id: "settings", label: "Settings", icon: "settings", section: "manage", ownerOnly: true },
];

/** Menu items this role may open (Staff don't see Earnings or Settings). */
export const navFor = (role: Role | null) => navItems.filter((item) => role === "owner" || !item.ownerOnly);

export const canOpen = (role: Role | null, screen: Screen) => role === "owner" || !navItems.some((item) => item.id === screen && item.ownerOnly);

// Sub-pages highlight their parent menu item.
export const navScreen = (s: Screen): Screen => (s === "member-payments" ? "payments" : s);

export const backLabels: Partial<Record<Screen, string>> = { members: "All members", payments: "Back to payments", renewals: "Back to renewals", attendance: "Back to attendance", dashboard: "Back to overview", plans: "Back to plans", settings: "Back to settings", "member-payments": "Back to payment history" };

export type RenewalTab = "expiring" | "expired" | "unpaid";
