import { FunctionsHttpError } from "@supabase/supabase-js";
import { formatShortDateTime, toLocalDateTime } from "./format";
import { formatSendTime, type SummarySection } from "./summary";
import { supabase } from "./supabase";

export type NotifyChannel = "whatsapp" | "email";

export type NotificationSettings = {
  enabled: boolean;
  channels: NotifyChannel[];
  whatsapp_number: string;
  email: string;
  send_time: string; // "HH:MM" IST
  included_sections: SummarySection[];
};

export type NotificationLogRow = { channel: NotifyChannel; kind: "daily" | "test"; status: "sending" | "sent" | "failed"; error: string; created_at: string; sent_at: string | null; fallback_for: string | null };

export type NotificationInfo = { settings: NotificationSettings; saved: boolean; log: NotificationLogRow[]; configured: Record<NotifyChannel, boolean> };

export type SendResult = { channel: NotifyChannel; status: "sent" | "failed" | "skipped"; error?: string; fallback?: boolean };

export const CHANNEL_LABELS: Record<NotifyChannel, string> = { whatsapp: "WhatsApp", email: "Email" };

/** Calls the "notifications" Edge Function (owner only) and turns errors into readable messages. */
export async function callNotifications<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("notifications", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? "Something went wrong. Try again.");
    }
    throw new Error("No internet connection. Check your network and try again.");
  }
  return data as T;
}

/** "Daily summary: ON at 8:00 PM via WhatsApp" */
export function summaryStatusLine(s: NotificationSettings) {
  if (!s.enabled) return "Daily summary: OFF";
  return `Daily summary: ON at ${formatSendTime(s.send_time)} via ${s.channels.map((c) => CHANNEL_LABELS[c]).join(" & ")}`;
}

/** "12 Oct, 8:00 PM" for a database timestamp. */
export const logTime = (timestamp: string) => formatShortDateTime(toLocalDateTime(new Date(timestamp)));
