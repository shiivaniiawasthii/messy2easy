// The owner's activity feed (bell): who changed what. Rows come from the activity_log table,
// which database triggers fill; only owners can read it.

import { type IconName } from "../components/Icon";
import { formatMoney, toLocalDateTime } from "./format";
import { supabase } from "./supabase";

export type ActivityRow = {
  id: number;
  actor: string | null;
  actor_name: string;
  action: string;
  member_id: string | null;
  member_name: string;
  amount: number | null;
  old_amount: number | null;
  detail: string;
  created_at: string;
};

export type ActivityKind = "money" | "members" | "checkins";

export async function loadActivity(limit = 80): Promise<ActivityRow[]> {
  const { data, error } = await supabase.from("activity_log").select("id, actor, actor_name, action, member_id, member_name, amount, old_amount, detail, created_at").order("id", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const money = (n: number | null) => (n === null ? "" : formatMoney(n));

/** What happened, without the person ("recorded ₹500 from Rahul (UPI)"). */
export function describeActivity(a: ActivityRow): { text: string; icon: IconName; kind: ActivityKind; warn: boolean } {
  const m = a.member_name || "a member";
  switch (a.action) {
    case "member_added": return { text: `added new member ${m}`, icon: "users", kind: "members", warn: false };
    // Logged with the person's own name as the actor ("Rahul registered …").
    case "member_registered": return { text: "registered through the gym’s form link. Check their Aadhaar to start the membership", icon: "users", kind: "members", warn: false };
    case "aadhaar_verified": return { text: `marked ${m}’s Aadhaar as valid`, icon: "shield", kind: "members", warn: false };
    case "aadhaar_rejected": return { text: `marked ${m}’s Aadhaar as the wrong document`, icon: "close", kind: "members", warn: true };
    // Automatic, on the start date the person chose (actor "Gym app").
    case "membership_auto_activated": return { text: `started ${m}’s membership on ${a.detail || "a"} plan (${money(a.amount)}). Payment is due, collect it at the desk`, icon: "check", kind: "money", warn: false };
    case "activation_needed": return { text: `couldn’t start ${m}’s membership: no matching plan${a.detail ? ` for ${a.detail}` : ""}. Activate it from their profile`, icon: "clock", kind: "members", warn: true };
    case "membership_activated": return { text: `activated ${m}’s membership on ${a.detail || "a"} plan (${money(a.amount)})`, icon: "check", kind: "money", warn: false };
    case "member_updated": return { text: `updated ${m}’s details`, icon: "edit", kind: "members", warn: false };
    case "member_suspended": return { text: `suspended ${m}’s membership`, icon: "close", kind: "members", warn: true };
    case "member_reactivated": return { text: `re-activated ${m}’s membership`, icon: "check", kind: "members", warn: false };
    case "member_deleted": return { text: `deleted member ${m}`, icon: "close", kind: "members", warn: true };
    case "payment_added": return { text: `recorded ${money(a.amount)} from ${m}${a.detail ? ` (${a.detail})` : ""}`, icon: "wallet", kind: "money", warn: false };
    case "payment_edited": return { text: a.old_amount !== null && a.old_amount !== a.amount ? `changed ${m}’s payment ${money(a.old_amount)} → ${money(a.amount)}` : `edited ${m}’s payment of ${money(a.amount)}`, icon: "edit", kind: "money", warn: true };
    case "payment_deleted": return { text: `deleted ${m}’s payment of ${money(a.amount)}`, icon: "close", kind: "money", warn: true };
    case "renewed": return { text: `renewed ${m} on ${a.detail || "a"} plan (${money(a.amount)})`, icon: "refresh", kind: "money", warn: false };
    case "membership_edited": return { text: `changed ${m}’s membership${a.old_amount !== null && a.old_amount !== a.amount ? ` price ${money(a.old_amount)} → ${money(a.amount)}` : ""}`, icon: "edit", kind: "money", warn: true };
    case "membership_deleted": return { text: `deleted a membership period of ${m}`, icon: "close", kind: "money", warn: true };
    case "checkin": return { text: `checked in ${m}`, icon: "check", kind: "checkins", warn: false };
    case "checkin_removed": return { text: `removed ${m}’s check-in`, icon: "close", kind: "checkins", warn: true };
    case "plan_added": return { text: `created plan ${a.detail} (${money(a.amount)})`, icon: "calendar", kind: "members", warn: false };
    case "plan_edited": return { text: a.old_amount !== null && a.old_amount !== a.amount ? `changed plan ${a.detail} price ${money(a.old_amount)} → ${money(a.amount)}` : `edited plan ${a.detail}`, icon: "calendar", kind: "members", warn: false };
    case "plan_deleted": return { text: `deleted plan ${a.detail}`, icon: "calendar", kind: "members", warn: true };
    case "expense_added": return { text: `added expense ${money(a.amount)}${a.detail ? ` (${a.detail})` : ""}`, icon: "wallet", kind: "money", warn: false };
    case "expense_deleted": return { text: `deleted expense ${money(a.amount)}${a.detail ? ` (${a.detail})` : ""}`, icon: "close", kind: "money", warn: true };
    case "gym_updated": return { text: "updated the gym profile", icon: "building", kind: "members", warn: false };
    default: return { text: a.action.replace(/_/g, " "), icon: "bell", kind: "members", warn: false };
  }
}

/** Local "YYYY-MM-DDTHH:MM:SS" of a log row. */
export const activityTime = (a: ActivityRow) => toLocalDateTime(new Date(a.created_at));

// "Seen up to" marker per user and device, for the unread count on the bell.
const seenKey = (userId: string) => `activity-seen:${userId}`;
export function lastSeenActivity(userId: string) {
  try { return Number(window.localStorage.getItem(seenKey(userId)) ?? 0); } catch { return 0; }
}
export function markActivitySeen(userId: string, id: number) {
  try { window.localStorage.setItem(seenKey(userId), String(id)); } catch { /* private mode: count resets */ }
}

/** New things other people did (check-ins are too frequent to count). */
export const unreadActivity = (rows: ActivityRow[], userId: string, seenId: number) => rows.filter((a) => a.id > seenId && a.actor !== userId && a.action !== "checkin");
