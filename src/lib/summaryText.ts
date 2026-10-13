// Turns a DailySummary into the WhatsApp / email / preview text.
// All wording lives in SUMMARY_STRINGS so a Hindi version can be added as another language.

import { DAYS_LONG, formatMoney, MONTHS, parseDate } from "./format.ts";
import { type DailySummary, type NamedDate, type SummarySection, SUMMARY_WINDOWS } from "./summary.ts";

export type SummaryLanguage = "en";

export const SUMMARY_STRINGS = {
  en: {
    title: (gym: string, date: string) => `${gym} — Daily summary, ${date}`,
    collections: (total: string, count: number, split: string) => `💰 Collected today: ${total} (${count} payment${count === 1 ? "" : "s"}${split ? `, ${split}` : ""})`,
    collectionsNone: "💰 Collected today: ₹0",
    checkins: (n: number) => `✅ Check-ins today: ${n}`,
    expiring: (n: number, list: string) => `⏰ Expiring in ${SUMMARY_WINDOWS.expiringDays} days: ${n}${list ? ` — ${list}` : ""}`,
    expired: (n: number, list: string) => `❌ Expired, not renewed: ${n}${list ? ` — ${list}` : ""}`,
    dues: (total: string, n: number, list: string) => `🧾 Pending dues: ${total} from ${n} member${n === 1 ? "" : "s"}${list ? ` — ${list}` : ""}`,
    duesNone: "🧾 Pending dues: None",
    inactive: (n: number, list: string) => `😴 Stopped coming: ${n}${list ? ` — ${list}` : ""}`,
    today: "today",
    tomorrow: "tomorrow",
    more: (n: number) => `+${n} more`,
    allClear: "🎉 All clear today — nothing needs your attention.",
    openApp: (url: string) => `Open app: ${url}`,
    button: "Open Gym Manager",
    subject: (gym: string, date: string) => `${gym} — Daily summary, ${date}`,
    footer: "You get this because the daily summary is on in Settings → Notifications.",
    notIncluded: "Not included",
  },
} as const;

const shortDate = (iso: string) => { const d = parseDate(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
/** "Mon 12 Oct" */
export const summaryDate = (iso: string) => `${DAYS_LONG[parseDate(iso).getDay()].slice(0, 3)} ${shortDate(iso)}`;

function namesWithDates(list: NamedDate[], lang: SummaryLanguage) {
  const t = SUMMARY_STRINGS[lang];
  const label = (x: NamedDate) => (x.daysFromToday === 0 ? t.today : x.daysFromToday === 1 ? t.tomorrow : shortDate(x.date));
  const shown = list.slice(0, SUMMARY_WINDOWS.listNames).map((x) => `${x.name} (${label(x)})`);
  if (list.length > shown.length) shown.push(t.more(list.length - shown.length));
  return shown.join(", ");
}

const withMore = (names: string[], total: number, lang: SummaryLanguage) => [...names, ...(total > names.length ? [SUMMARY_STRINGS[lang].more(total - names.length)] : [])].join(", ");

/** One line per chosen section, in a fixed order. */
export function summaryLines(s: DailySummary, lang: SummaryLanguage = "en"): Record<SummarySection, string> {
  const t = SUMMARY_STRINGS[lang];
  const split = s.collections.byMethod.map((m) => `${m.method} ${formatMoney(m.amount)}`).join(" · ");
  return {
    collections: s.collections.count ? t.collections(formatMoney(s.collections.total), s.collections.count, split) : t.collectionsNone,
    checkins: t.checkins(s.checkins),
    expiring: t.expiring(s.expiring.length, namesWithDates(s.expiring, lang)),
    expired: t.expired(s.expired.length, withMore(s.expired.slice(0, SUMMARY_WINDOWS.listNames).map((x) => x.name), s.expired.length, lang)),
    dues: s.dues.count ? t.dues(formatMoney(s.dues.total), s.dues.count, withMore(s.dues.top.map((d) => `${d.name} ${formatMoney(d.amount)}`), s.dues.count, lang)) : t.duesNone,
    inactive: t.inactive(s.inactive.count, withMore(s.inactive.names, s.inactive.count, lang)),
  };
}

/** Plain text (WhatsApp free-form / email text part / preview). */
export function summaryText(s: DailySummary, appUrl: string, lang: SummaryLanguage = "en") {
  const t = SUMMARY_STRINGS[lang];
  const lines = summaryLines(s, lang);
  return [t.title(s.gymName, summaryDate(s.date)), ...(s.allClear ? [t.allClear] : s.sections.map((id) => lines[id])), t.openApp(appUrl)].join("\n");
}

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Simple HTML email with a button to the app. */
export function summaryHtml(s: DailySummary, appUrl: string, lang: SummaryLanguage = "en") {
  const t = SUMMARY_STRINGS[lang];
  const lines = summaryLines(s, lang);
  const rows = (s.allClear ? [t.allClear] : s.sections.map((id) => lines[id])).map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#1d2b24">${escapeHtml(l)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif"><div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border:1px solid #e3e9e5;border-radius:14px;padding:22px"><h1 style="margin:0 0 16px;font-size:18px;color:#0f7a4d">${escapeHtml(t.title(s.gymName, summaryDate(s.date)))}</h1>${rows}<a href="${escapeHtml(appUrl)}" style="display:inline-block;margin-top:8px;background:#0f7a4d;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:bold;font-size:14px">${t.button}</a></div><p style="font-size:11px;color:#7a8a81;margin:14px 4px 0">${t.footer}</p></div></body></html>`;
}

/**
 * Body parameters for the approved WhatsApp template (see README: "Daily summary on WhatsApp").
 * Order: {{1}} gym, {{2}} date, {{3}} collections, {{4}} check-ins, {{5}} expiring,
 * {{6}} expired, {{7}} dues, {{8}} stopped coming. WhatsApp rejects newlines/tabs in parameters.
 */
export function whatsappTemplateParams(s: DailySummary, lang: SummaryLanguage = "en") {
  const t = SUMMARY_STRINGS[lang];
  const lines = summaryLines(s, lang);
  const value = (id: SummarySection) => (s.sections.includes(id) ? lines[id].replace(/^\S+\s[^:]+:\s*/, "") : t.notIncluded);
  const clean = (v: string) => v.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 900);
  return [s.gymName, summaryDate(s.date), value("collections"), value("checkins"), value("expiring"), value("expired"), value("dues"), value("inactive")].map(clean);
}
