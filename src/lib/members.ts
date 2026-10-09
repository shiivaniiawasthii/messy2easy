import { type AppData, type Member } from "../data/types";
import { diffDays, formatDate, formatMoney } from "./format";

export type MemberStatus = "Active" | "Expired" | "Suspended";

export type PaymentState = "Paid" | "Partial" | "Unpaid";

export function memberStatus(m: Member, today: string): MemberStatus {
  if (m.suspended) return "Suspended";
  return m.expiryDate < today ? "Expired" : "Active";
}

export function paymentState(m: Member): PaymentState {
  if (m.balance <= 0) return "Paid";
  return m.balance >= m.planPrice ? "Unpaid" : "Partial";
}

export function isExpiringSoon(m: Member, today: string) {
  return memberStatus(m, today) === "Active" && diffDays(m.expiryDate, today) <= 7;
}

export const statusTone = (s: string) => (s === "Active" ? "success" : s === "Expired" ? "danger" : "neutral");

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
