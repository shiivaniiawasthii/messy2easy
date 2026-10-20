// Explicit .ts extensions: this file is also used by the server (Supabase Edge Function, Deno).
import { type AppData, type Member, type Renewal } from "../data/types.ts";
import { diffDays, formatDate, formatMoney } from "./format.ts";

/** "Pending" = registered through the form, no membership activated yet. */
export type MemberStatus = "Active" | "Expired" | "Suspended" | "Pending";

export type PaymentState = "Paid" | "Partial" | "Unpaid";

export function memberStatus(m: Member, today: string): MemberStatus {
  if (m.suspended) return "Suspended";
  if (m.pending) return "Pending";
  return m.expiryDate < today ? "Expired" : "Active";
}

/** Ids of each member's first membership (joining). The others are renewals. */
export function firstMembershipIds(renewals: Renewal[]) {
  const first = new Map<string, Renewal>();
  renewals.forEach((r) => {
    const f = first.get(r.memberId);
    if (!f || r.startDate < f.startDate || (r.startDate === f.startDate && r.createdAt < f.createdAt)) first.set(r.memberId, r);
  });
  return new Set([...first.values()].map((r) => r.id));
}

export function paymentState(m: Member): PaymentState {
  if (m.balance <= 0) return "Paid";
  return m.balance >= m.planPrice ? "Unpaid" : "Partial";
}

export function isExpiringSoon(m: Member, today: string, withinDays = 7) {
  return memberStatus(m, today) === "Active" && diffDays(m.expiryDate, today) <= withinDays;
}

// --- "What needs attention" lists. Shared by the Dashboard, Renewals and the daily summary,
// so the numbers always match. ---

/** Active memberships ending within `days` (0 = today), soonest first. */
export const expiringWithin = (members: Member[], today: string, days: number) =>
  members.filter((m) => isExpiringSoon(m, today, days)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

/** Memberships that ended within the last `days` and were not renewed, most recent first. */
export const expiredWithin = (members: Member[], today: string, days: number) =>
  members.filter((m) => memberStatus(m, today) === "Expired" && diffDays(today, m.expiryDate) <= days).sort((a, b) => b.expiryDate.localeCompare(a.expiryDate));

/** Members who owe money, biggest balance first. */
export const membersWithDues = (members: Member[]) => members.filter((m) => m.balance > 0).sort((a, b) => b.balance - a.balance);

/** Last check-in date ("YYYY-MM-DD") of each member. */
export function lastVisits(data: AppData) {
  const last = new Map<string, string>();
  data.attendance.forEach((a) => { const d = a.at.slice(0, 10); if ((last.get(a.memberId) ?? "") < d) last.set(a.memberId, d); });
  return last;
}

/** Active members with no visit for `days`+ days (counting from joining if they never came), longest gap first. */
export function stoppedComing(data: AppData, today: string, days = 14, last = lastVisits(data)) {
  return data.members.filter((m) => memberStatus(m, today) === "Active" && diffDays(today, last.get(m.id) ?? m.joined) >= days).sort((a, b) => (last.get(a.id) ?? "").localeCompare(last.get(b.id) ?? ""));
}

export const statusTone = (s: string) => (s === "Active" ? "success" : s === "Expired" ? "danger" : s === "Pending" ? "warning" : "neutral");

export const paymentTone = (s: string) => (s === "Paid" ? "success" : s === "Partial" ? "warning" : "danger");

export const durationLabel = (days: number) => (days === 1 ? "1 day" : `${days} days`);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function expiryLabel(days: number) {
  if (days < 0) return `Expired ${plural(-days, "day")} ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

// One alert per member, most urgent first: expired → expiring this week → dues only.
export type Alert = { member: Member; label: string; detail: string; urgent: boolean; rank: number };

export function memberAlerts(data: AppData, today: string): Alert[] {
  const alerts: Alert[] = [];
  data.members.forEach((m) => {
    const status = memberStatus(m, today);
    const days = diffDays(m.expiryDate, today);
    const dues = m.balance > 0 ? `${formatMoney(m.balance)} due` : "";
    const detail = (text: string) => [text, dues].filter(Boolean).join(" · ");
    if (status === "Expired" && days >= -30) alerts.push({ member: m, label: "Expired", detail: detail(`${m.plan} plan ended ${formatDate(m.expiryDate)}`), urgent: true, rank: 0 });
    else if (status === "Active" && days <= 7) alerts.push({ member: m, label: expiryLabel(days), detail: detail(`${m.plan} plan ends ${formatDate(m.expiryDate)}`), urgent: days <= 1, rank: 1 + days / 10 });
    else if (m.balance > 0) alerts.push({ member: m, label: dues, detail: `${m.plan} plan · ${paymentState(m).toLowerCase()} payment`, urgent: false, rank: 2 });
  });
  return alerts.sort((a, b) => a.rank - b.rank);
}

/** Members ordered by total amount paid (highest first). */
export function revenueRanking(data: AppData) {
  const totals = new Map<string, number>();
  data.payments.forEach((p) => totals.set(p.memberId, (totals.get(p.memberId) ?? 0) + p.amount));
  return data.members.map((m) => ({ member: m, total: totals.get(m.id) ?? 0, count: data.payments.filter((p) => p.memberId === m.id).length })).sort((a, b) => b.total - a.total);
}

export function memberRank(data: AppData, memberId: string) {
  return revenueRanking(data).findIndex((r) => r.member.id === memberId) + 1;
}
