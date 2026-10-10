// Edge Function: creates and manages login accounts.
// Runs on Supabase's servers with the service-role key (never sent to the browser).
//
// Actions (POST JSON { action, ... } with the caller's login token):
//   create_gym      platform admin → new gym + its owner account
//   add_staff       owner          → new owner/staff login in their gym
//   reset_password  owner (own gym) or platform admin → new temporary password
//   remove_staff    owner (own gym) → delete a login (not themselves, not the last owner)
//   update_staff    owner (own gym) or platform admin → change name / login mobile
//   delete_gym      platform admin → delete a gym, all its data and its logins
//
// Every new account / reset returns a temporary password. The app shows a
// "Send on WhatsApp" button, and the user must set their own password on first login.

import { createClient } from "npm:@supabase/supabase-js@2";
import { loginEmail } from "../_shared/login.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class UserError extends Error {}

const PHONE = /^[6-9][0-9]{9}$/;
const cleanPhone = (value: unknown) => String(value ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
const cleanName = (value: unknown) => String(value ?? "").trim();

function requirePhone(value: unknown) {
  const phone = cleanPhone(value);
  if (!PHONE.test(phone)) throw new UserError("Enter a valid 10-digit Indian mobile number.");
  return phone;
}

function requireName(value: unknown, what: string) {
  const name = cleanName(value);
  if (name.length < 2 || name.length > 80) throw new UserError(`Enter the ${what}.`);
  return name;
}

/** Easy to read out or type on a phone, e.g. "kmrt-4827". */
function temporaryPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const word = Array.from(bytes.slice(0, 4), (b) => letters[b % letters.length]).join("");
  const digits = Array.from(bytes.slice(4), (b) => String(b % 10)).join("");
  return `${word}-${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Who is calling?
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return reply(401, { error: "Please log in again." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: me, error: meError } = await admin.from("staff").select("gym_id, role, active").eq("user_id", user.id).maybeSingle();
  const { data: platformAdmin, error: adminError } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (meError || adminError) {
    // Usually missing database privileges for the service role (see the service_role_grants migration).
    console.error("Lookup failed", meError ?? adminError);
    return reply(500, { error: "Server setup problem. Please contact Messy2Easy support." });
  }
  const isOwner = me?.active && me.role === "owner";

  // Creates the auth user and the staff row together (removes the auth user if the second step fails).
  async function createLogin(gymId: string, name: string, phone: string, role: "owner" | "staff") {
    const { data: existing } = await admin.from("staff").select("user_id").eq("phone", phone).maybeSingle();
    if (existing) throw new UserError("This mobile number already has a login.");
    const password = temporaryPassword();
    const { data, error } = await admin.auth.admin.createUser({ email: loginEmail(phone), password, email_confirm: true, user_metadata: { name } });
    if (error || !data.user) throw new UserError(error?.message.includes("already") ? "This mobile number already has a login." : "Could not create the login. Try again.");
    const { error: staffError } = await admin.from("staff").insert({ user_id: data.user.id, gym_id: gymId, name, phone, role, must_change_password: true });
    if (staffError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new UserError("Could not create the login. Try again.");
    }
    return { userId: data.user.id, phone, temporaryPassword: password };
  }

  try {
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "create_gym": {
        if (!platformAdmin) return reply(403, { error: "Only the platform admin can add gyms." });
        const gymName = requireName(body.gymName, "gym name");
        const ownerName = requireName(body.ownerName, "owner's name");
        const phone = requirePhone(body.ownerPhone);
        const { data: gym, error } = await admin.from("gyms").insert({ name: gymName, address: cleanName(body.address), phone: cleanName(body.gymPhone) }).select("id").single();
        if (error || !gym) throw new UserError("Could not create the gym. Try again.");
        try {
          const login = await createLogin(gym.id, ownerName, phone, "owner");
          return reply(200, { gymId: gym.id, ...login });
        } catch (e) {
          await admin.from("gyms").delete().eq("id", gym.id);
          throw e;
        }
      }

      case "add_staff": {
        if (!isOwner) return reply(403, { error: "Only the gym owner can add staff." });
        const role = body.role === "owner" ? "owner" : "staff";
        const login = await createLogin(me!.gym_id, requireName(body.name, "name"), requirePhone(body.phone), role);
        return reply(200, login);
      }

      case "reset_password": {
        const { data: target } = await admin.from("staff").select("user_id, gym_id, phone").eq("user_id", String(body.userId ?? "")).maybeSingle();
        if (!target) throw new UserError("Staff member not found.");
        const allowed = platformAdmin || (isOwner && target.gym_id === me!.gym_id && target.user_id !== user.id);
        if (!allowed) return reply(403, { error: "You can't reset this password." });
        const password = temporaryPassword();
        const { error } = await admin.auth.admin.updateUserById(target.user_id, { password });
        if (error) throw new UserError("Could not reset the password. Try again.");
        await admin.from("staff").update({ must_change_password: true, active: true }).eq("user_id", target.user_id);
        return reply(200, { userId: target.user_id, phone: target.phone, temporaryPassword: password });
      }

      case "remove_staff": {
        if (!isOwner) return reply(403, { error: "Only the gym owner can remove staff." });
        const { data: target } = await admin.from("staff").select("user_id, gym_id, role").eq("user_id", String(body.userId ?? "")).maybeSingle();
        if (!target || target.gym_id !== me!.gym_id) throw new UserError("Staff member not found.");
        if (target.user_id === user.id) throw new UserError("You can't remove yourself.");
        if (target.role === "owner") {
          const { count } = await admin.from("staff").select("user_id", { count: "exact", head: true }).eq("gym_id", me!.gym_id).eq("role", "owner").eq("active", true);
          if ((count ?? 0) <= 1) throw new UserError("The gym needs at least one owner.");
        }
        const { error } = await admin.auth.admin.deleteUser(target.user_id); // staff row is removed with it
        if (error) throw new UserError("Could not remove this login. Try again.");
        return reply(200, { removed: target.user_id });
      }

      case "update_staff": {
        // Name and/or mobile number of a login. Platform admin (any gym) or an owner (own gym).
        const { data: target } = await admin.from("staff").select("user_id, gym_id, phone").eq("user_id", String(body.userId ?? "")).maybeSingle();
        if (!target) throw new UserError("Login not found.");
        if (!platformAdmin && !(isOwner && target.gym_id === me!.gym_id)) return reply(403, { error: "You can't change this login." });
        const name = requireName(body.name, "name");
        const phone = requirePhone(body.phone);
        if (phone !== target.phone) {
          const { data: taken } = await admin.from("staff").select("user_id").eq("phone", phone).maybeSingle();
          if (taken) throw new UserError("This mobile number already has a login.");
          const { error } = await admin.auth.admin.updateUserById(target.user_id, { email: loginEmail(phone), email_confirm: true });
          if (error) throw new UserError("Could not change the mobile number. Try again.");
        }
        const { error } = await admin.from("staff").update({ name, phone }).eq("user_id", target.user_id);
        if (error) throw new UserError("Could not save. Try again.");
        return reply(200, { userId: target.user_id, name, phone });
      }

      case "delete_gym": {
        // Removes a gym with all its data and every login that belongs to it.
        if (!platformAdmin) return reply(403, { error: "Only the platform admin can delete gyms." });
        const gymId = String(body.gymId ?? "");
        const { data: gym } = await admin.from("gyms").select("id, name").eq("id", gymId).maybeSingle();
        if (!gym) throw new UserError("Gym not found.");
        if (String(body.confirmName ?? "").trim() !== gym.name) throw new UserError("Type the gym name exactly to confirm.");
        const { data: logins } = await admin.from("staff").select("user_id").eq("gym_id", gymId);
        const { error } = await admin.from("gyms").delete().eq("id", gymId); // members, payments, check-ins… go with it
        if (error) throw new UserError("Could not delete the gym. Try again.");
        for (const l of logins ?? []) await admin.auth.admin.deleteUser(l.user_id);
        return reply(200, { deleted: gymId, loginsRemoved: (logins ?? []).length });
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
