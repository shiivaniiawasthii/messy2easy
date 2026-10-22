// Gym logos: public `gym-logos` bucket. Only the Messy2Easy admin uploads or removes them
// (storage policies + admin_set_gym_logo). Everyone else just shows the picture.

import { supabase } from "./supabase";

const BUCKET = "gym-logos";
export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Public address of a logo ("" when the gym has none). */
export const gymLogoUrl = (path: string) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "");

/** Admin: stores a new logo for the gym, then removes the old file. */
export async function setGymLogo(gymId: string, file: File, oldPath: string) {
  const ext = LOGO_TYPES[file.type];
  if (!ext) throw new Error("Use a PNG, JPG or WEBP image.");
  if (file.size > LOGO_MAX_BYTES) throw new Error("The logo is bigger than 2 MB. Use a smaller image.");
  // A new name each time, so browsers don't keep showing a cached old logo.
  const path = `${gymId}/${Date.now()}.${ext}`;
  const upload = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw new Error("Couldn't upload the logo. Try again.");
  const { error } = await supabase.rpc("admin_set_gym_logo", { p_gym_id: gymId, p_path: path });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error("Couldn't save the logo. Try again.");
  }
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  return path;
}

/** Admin: the gym goes back to no logo. */
export async function removeGymLogo(gymId: string, oldPath: string) {
  const { error } = await supabase.rpc("admin_set_gym_logo", { p_gym_id: gymId, p_path: "" });
  if (error) throw new Error("Couldn't remove the logo. Try again.");
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
}
