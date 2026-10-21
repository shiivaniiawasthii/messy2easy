// Edge Function: public member registration (the gym's form link). No login.
// Runs on Supabase's servers with the service-role key (never sent to the browser).
//
// POST multipart/form-data:
//   token    the gym's registration token (from /?join=<token>)
//   data     JSON: name, phone, email, dob, gender, address, emergency, intake (answers + plan/start/payment)
//   aadhaar  the Aadhaar copy (JPEG/PNG/WEBP/HEIC/PDF, max 10 MB)
//
// Order: check answers (src/lib/intake.ts) → check the file (size, type and its first bytes)
// → check the link → store the file in the private `member-documents` bucket → register_member
// (checks the link again, plan, duplicates, hourly limit). If registration fails the file is removed.
// Deploy: npx supabase functions deploy register --no-verify-jwt   (visitors have no login token)

import { createClient } from "npm:@supabase/supabase-js@2";
import { zonedDateTime } from "../../../src/lib/format.ts";
import { AADHAAR_MAX_BYTES, AADHAAR_TYPES, checkRegistration, looksLikeAllowedFile, REGISTRATION_ERRORS } from "../../../src/lib/intake.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "member-documents";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply(400, { error: "Couldn't read the form. Please try again." });
  }
  const token = String(form.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) return reply(400, { error: REGISTRATION_ERRORS.link_invalid });

  let data: unknown;
  try {
    data = JSON.parse(String(form.get("data") ?? "{}"));
  } catch {
    return reply(400, { error: REGISTRATION_ERRORS.invalid_answers });
  }
  const today = zonedDateTime(new Date()).slice(0, 10);
  const checked = checkRegistration(data, today);
  if (!checked.ok) return reply(400, { error: checked.error });
  const input = checked.value;

  const file = form.get("aadhaar");
  if (!(file instanceof File) || file.size === 0) return reply(400, { error: REGISTRATION_ERRORS.aadhaar_required });
  if (file.size > AADHAAR_MAX_BYTES) return reply(400, { error: "The Aadhaar file is bigger than 10 MB. Upload a smaller photo or PDF." });
  const ext = AADHAAR_TYPES[file.type];
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!ext || !looksLikeAllowedFile(file.type, bytes.subarray(0, 16))) return reply(400, { error: "Upload the Aadhaar as a photo (JPG, PNG) or a PDF." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Check the link before storing anything, so a wrong link can't be used to upload files.
  const gym = await admin.rpc("registration_form", { p_token: token }).maybeSingle();
  if (gym.error) {
    console.error("registration_form failed", gym.error);
    return reply(500, { error: "Couldn't submit the form. Please try again." });
  }
  if (!gym.data) return reply(400, { error: REGISTRATION_ERRORS.link_invalid });

  // A random name: the file is found through members.aadhaar_path, never by guessing a path.
  const path = `aadhaar/${crypto.randomUUID()}.${ext}`;
  const upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error) {
    console.error("Aadhaar upload failed", upload.error);
    return reply(500, { error: "Couldn't upload the Aadhaar file. Check your internet and try again." });
  }

  const { data: code, error } = await admin.rpc("register_member", {
    p_token: token,
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email,
    p_date_of_birth: input.dob,
    p_gender: input.gender,
    p_address: input.address,
    p_emergency_contact: input.emergency,
    p_intake: input.intake,
    p_aadhaar_path: path,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    const known = REGISTRATION_ERRORS[error.message];
    if (!known) console.error("register_member failed", error);
    return reply(known ? 400 : 500, { error: known ?? "Couldn't submit the form. Please try again." });
  }
  return reply(200, { code });
});
