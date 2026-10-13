// Edge Function: owner notifications (daily summary by WhatsApp and/or email).
//
// Actions (POST JSON { action, ... }):
//   run            Supabase cron, every 15 min. Header "x-cron-secret" must match CRON_SECRET.
//                  Sends today's summary to every gym whose send time has come (IST).
//   get_settings   owner → settings, last deliveries, which channels are set up
//   save_settings  owner → save settings
//   send_test      owner → send the real summary now with the given settings
//
// Staff, paused gyms and visitors get 403. The summary uses the same code as the app
// (src/lib/summary.ts on src/data/appData.ts), so the numbers always match the Dashboard.

import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchAppRows, toAppData } from "../../../src/data/appData.ts";
import { ATTENDANCE_DAYS_LOADED } from "../../../src/data/types.ts";
import { addDays, zonedDateTime } from "../../../src/lib/format.ts";
import { buildDailySummary, DEFAULT_SEND_TIME, isSummaryDue, SUMMARY_SECTIONS, type SummarySection } from "../../../src/lib/summary.ts";
import { SUMMARY_STRINGS, summaryDate, summaryHtml, summaryText, whatsappTemplateParams } from "../../../src/lib/summaryText.ts";
import { type Channel, isConfigured, type NotificationPayload, sendNotification } from "../_shared/notify.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
class UserError extends Error {}

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
const APP_URL = () => env("APP_URL") || "https://messy2easy.vercel.app";
const TESTS_PER_DAY = 10;

type Settings = { enabled: boolean; channels: Channel[]; whatsapp_number: string; email: string; send_time: string; included_sections: SummarySection[] };

/** Constant-time comparison for the cron secret. */
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function validSettings(input: Record<string, unknown>): Settings {
  const channels = Array.isArray(input.channels) ? [...new Set(input.channels.filter((c): c is Channel => c === "whatsapp" || c === "email"))] : [];
  const sections = Array.isArray(input.included_sections) ? SUMMARY_SECTIONS.filter((s) => (input.included_sections as unknown[]).includes(s)) : [];
  const whatsapp = String(input.whatsapp_number ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const email = String(input.email ?? "").trim().toLowerCase();
  const sendTime = String(input.send_time ?? DEFAULT_SEND_TIME).slice(0, 5);
  const enabled = input.enabled === true;
  if (!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(sendTime)) throw new UserError("Choose a send time.");
  if (whatsapp && !/^[6-9]\d{9}$/.test(whatsapp)) throw new UserError("Enter a valid 10-digit WhatsApp number.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Enter a valid email address.");
  if (enabled || input.forTest) {
    if (channels.length === 0) throw new UserError("Choose WhatsApp, Email or both.");
    if (channels.includes("whatsapp") && !whatsapp) throw new UserError("Enter the WhatsApp number.");
    if (channels.includes("email") && !email) throw new UserError("Enter the email address.");
    if (sections.length === 0) throw new UserError("Choose at least one thing to include.");
  }
  return { enabled, channels, whatsapp_number: whatsapp, email, send_time: `${sendTime}:00`, included_sections: sections };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const url = env("SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const nowLocal = zonedDateTime(now);
  const today = nowLocal.slice(0, 10);

  /** Builds today's summary for a gym and the message in every format. */
  async function buildPayload(gymId: string, sections: SummarySection[]): Promise<NotificationPayload> {
    const since = new Date(`${addDays(today, -ATTENDANCE_DAYS_LOADED)}T00:00:00+05:30`).toISOString();
    const data = toAppData(await fetchAppRows(admin, since, gymId), (ts) => zonedDateTime(new Date(ts)));
    const summary = buildDailySummary(data, today, sections);
    return {
      subject: SUMMARY_STRINGS.en.subject(summary.gymName, summaryDate(today)),
      text: summaryText(summary, APP_URL()),
      html: summaryHtml(summary, APP_URL()),
      templateParams: whatsappTemplateParams(summary),
    };
  }

  /**
   * Sends to each chosen channel and logs the result. "daily" claims each channel once per day first
   * (no duplicates even if the cron retries). If WhatsApp fails, the summary goes by email instead
   * when an email address is saved and email wasn't chosen anyway.
   */
  async function deliver(gymId: string, s: Settings, kind: "daily" | "test") {
    const payload = await buildPayload(gymId, s.included_sections);
    const results: { channel: Channel; status: "sent" | "failed" | "skipped"; error?: string; fallback?: boolean }[] = [];
    const sendOne = async (channel: Channel, fallbackFor: "whatsapp" | null) => {
      const to = channel === "whatsapp" ? `91${s.whatsapp_number}` : s.email;
      let logId: string | null;
      if (kind === "daily") {
        const { data, error } = await admin.rpc("claim_daily_notification", { p_gym_id: gymId, p_date: today, p_channel: channel, p_fallback_for: fallbackFor });
        if (error) throw new Error(error.message);
        logId = data;
        if (!logId) { results.push({ channel, status: "skipped" }); return true; } // already sent today
      } else {
        const { data, error } = await admin.from("notification_log").insert({ gym_id: gymId, summary_date: today, channel, kind, status: "sending", fallback_for: fallbackFor }).select("id").single();
        if (error) throw new Error(error.message);
        logId = data.id;
      }
      const res = await sendNotification(channel, to, payload);
      await admin.from("notification_log").update(res.ok ? { status: "sent", sent_at: new Date().toISOString(), error: "" } : { status: "failed", error: res.error }).eq("id", logId);
      results.push(res.ok ? { channel, status: "sent", fallback: !!fallbackFor } : { channel, status: "failed", error: res.error, fallback: !!fallbackFor });
      return res.ok;
    };
    for (const channel of s.channels) {
      const ok = await sendOne(channel, null);
      if (!ok && channel === "whatsapp" && !s.channels.includes("email") && s.email) await sendOne("email", "whatsapp");
    }
    return results;
  }

  try {
    // --- Scheduled run (Supabase cron) ---
    if (body.action === "run") {
      if (!sameSecret(req.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) return reply(403, { error: "Forbidden" });
      const { data: rows, error } = await admin.from("notification_settings").select("gym_id, enabled, channels, whatsapp_number, email, send_time, included_sections, gyms!inner(active, subscription_ends_on)").eq("enabled", true);
      if (error) throw new Error(error.message);
      const report = { at: nowLocal, checked: rows?.length ?? 0, due: 0, sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
      for (const row of rows ?? []) {
        // One gym's problem must not stop the others.
        try {
          const gym = row.gyms as unknown as { active: boolean; subscription_ends_on: string | null };
          if (!gym.active || (gym.subscription_ends_on && gym.subscription_ends_on < today)) continue;
          if (!isSummaryDue(row.send_time, nowLocal)) continue;
          report.due++;
          for (const r of await deliver(row.gym_id, row as Settings, "daily")) report[r.status]++;
        } catch (e) {
          report.failed++;
          report.errors.push(`${row.gym_id}: ${(e as Error).message}`);
          console.error("summary failed", row.gym_id, e);
        }
      }
      return reply(200, report);
    }

    // --- Owner actions ---
    const caller = createClient(url, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return reply(401, { error: "Please log in again." });
    // current_gym_id() is null for paused gyms; is_owner() is false for staff.
    const [{ data: gymId }, { data: isOwner }] = await Promise.all([caller.rpc("current_gym_id"), caller.rpc("is_owner")]);
    if (!gymId || !isOwner) return reply(403, { error: "Only the gym owner can manage notifications." });

    switch (body.action) {
      case "get_settings": {
        const [{ data: saved }, { data: log }, { data: me }] = await Promise.all([
          admin.from("notification_settings").select("enabled, channels, whatsapp_number, email, send_time, included_sections, updated_at").eq("gym_id", gymId).maybeSingle(),
          admin.from("notification_log").select("channel, kind, status, error, created_at, sent_at, fallback_for").eq("gym_id", gymId).order("created_at", { ascending: false }).limit(10),
          admin.from("staff").select("phone").eq("user_id", user.id).maybeSingle(),
        ]);
        const settings = saved ?? { enabled: false, channels: ["whatsapp"], whatsapp_number: me?.phone ?? "", email: "", send_time: `${DEFAULT_SEND_TIME}:00`, included_sections: [...SUMMARY_SECTIONS], updated_at: null };
        return reply(200, { settings: { ...settings, send_time: String(settings.send_time).slice(0, 5) }, saved: !!saved, log: log ?? [], configured: { whatsapp: isConfigured("whatsapp"), email: isConfigured("email") } });
      }

      case "save_settings": {
        const s = validSettings(body.settings ?? {});
        const { error } = await admin.from("notification_settings").upsert({ gym_id: gymId, ...s, updated_at: new Date().toISOString(), updated_by: user.id });
        if (error) throw new Error(error.message);
        return reply(200, { saved: true });
      }

      case "send_test": {
        const s = validSettings({ ...(body.settings ?? {}), forTest: true });
        const { count } = await admin.from("notification_log").select("id", { count: "exact", head: true }).eq("gym_id", gymId).eq("kind", "test").eq("summary_date", today);
        if ((count ?? 0) >= TESTS_PER_DAY) throw new UserError(`You can send ${TESTS_PER_DAY} test summaries a day. Try again tomorrow.`);
        return reply(200, { results: await deliver(gymId as string, s, "test") });
      }

      default:
        return reply(400, { error: "Unknown action" });
    }
  } catch (e) {
    if (e instanceof UserError) return reply(400, { error: e.message });
    console.error(e);
    return reply(500, { error: "Something went wrong. Try again." });
  }
});

