// The owner's daily summary: what happened today and what needs attention.
// Pure functions on AppData, using the same lists as the Dashboard and Renewals page,
// so the message always matches the app. Runs in the browser and on the server (Deno).

import { type AppData } from "../data/types.ts";
import { diffDays } from "./format.ts";
import { expiredWithin, expiringWithin, membersWithDues, stoppedComing } from "./members.ts";

export const SUMMARY_SECTIONS = ["collections", "checkins", "expiring", "expired", "dues", "inactive"] as const;
export type SummarySection = (typeof SUMMARY_SECTIONS)[number];

/** Look-ahead / look-back windows used by the summary. */
export const SUMMARY_WINDOWS = { expiringDays: 3, expiredDays: 7, inactiveDays: 14, topDues: 5, listNames: 5 };

export type NamedDate = { name: string; date: string; daysFromToday: number };

export type DailySummary = {
  gymName: string;
  date: string; // IST "YYYY-MM-DD"
  sections: SummarySection[];
  collections: { total: number; count: number; byMethod: { method: string; amount: number }[] };
  checkins: number;
  expiring: NamedDate[];
  expired: NamedDate[];
  dues: { total: number; count: number; top: { name: string; amount: number }[] };
  inactive: { count: number; names: string[] };
  /** Nothing collected, nobody came and nothing needs attention. */
  allClear: boolean;
};

// --- Scheduling (all times are IST) ---

/** Send-time choices in the settings: every 30 minutes from 6:00 AM to 11:30 PM ("HH:MM"). */
export const SEND_TIMES = Array.from({ length: 36 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
export const DEFAULT_SEND_TIME = "20:00";

/** "20:00" → "8:00 PM" */
export function formatSendTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** If the cron misses a run, still send within this long after the chosen time, but not later. */
export const CATCH_UP_MINUTES = 120;

/**
 * Is a gym's daily summary due at `nowLocal` (IST "YYYY-MM-DDTHH:MM:SS")? True from the chosen time
 * until CATCH_UP_MINUTES later. Whether it was already sent is checked separately (notification_log).
 */
export function isSummaryDue(sendTime: string, nowLocal: string) {
  const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const late = toMinutes(nowLocal.slice(11, 16)) - toMinutes(sendTime.slice(0, 5));
  return late >= 0 && late < CATCH_UP_MINUTES;
}

/** Builds the summary for `today` (an IST date). Only the chosen sections are filled. */
export function buildDailySummary(data: AppData, today: string, sections: readonly SummarySection[] = SUMMARY_SECTIONS): DailySummary {
  const on = (s: SummarySection) => sections.includes(s);
  const named = (m: { name: string; expiryDate: string }): NamedDate => ({ name: m.name, date: m.expiryDate, daysFromToday: diffDays(m.expiryDate, today) });

  const paidToday = on("collections") ? data.payments.filter((p) => p.paidAt.startsWith(today)) : [];
  const methodTotals = new Map<string, number>();
  paidToday.forEach((p) => methodTotals.set(p.method, (methodTotals.get(p.method) ?? 0) + p.amount));

  const dues = on("dues") ? membersWithDues(data.members) : [];
  const inactive = on("inactive") ? stoppedComing(data, today, SUMMARY_WINDOWS.inactiveDays) : [];

  const summary: DailySummary = {
    gymName: data.gym.name,
    date: today,
    sections: SUMMARY_SECTIONS.filter(on),
    collections: {
      total: paidToday.reduce((s, p) => s + p.amount, 0),
      count: paidToday.length,
      byMethod: [...methodTotals.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    },
    checkins: on("checkins") ? data.attendance.filter((a) => a.at.startsWith(today)).length : 0,
    expiring: on("expiring") ? expiringWithin(data.members, today, SUMMARY_WINDOWS.expiringDays).map(named) : [],
    expired: on("expired") ? expiredWithin(data.members, today, SUMMARY_WINDOWS.expiredDays).map(named) : [],
    dues: { total: dues.reduce((s, m) => s + m.balance, 0), count: dues.length, top: dues.slice(0, SUMMARY_WINDOWS.topDues).map((m) => ({ name: m.name, amount: m.balance })) },
    inactive: { count: inactive.length, names: inactive.slice(0, SUMMARY_WINDOWS.listNames).map((m) => m.name) },
    allClear: false,
  };
  summary.allClear = summary.collections.count === 0 && summary.checkins === 0 && summary.expiring.length === 0 && summary.expired.length === 0 && summary.dues.count === 0 && summary.inactive.count === 0;
  return summary;
}
