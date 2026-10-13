// Sending notifications. One small interface, one provider per channel, so another
// provider (Interakt, AiSensy, Gupshup, another email service…) can be swapped in later
// by adding a provider and pointing WHATSAPP_PROVIDER / EMAIL_PROVIDER at it.
//
// Secrets (Supabase → Edge Functions → Secrets), see README "Owner notifications":
//   RESEND_API_KEY, NOTIFY_EMAIL_FROM
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME, WHATSAPP_TEMPLATE_LANG

export type Channel = "whatsapp" | "email";

export type NotificationPayload = {
  subject: string;
  text: string;
  html: string;
  /** Body parameters of the approved WhatsApp template, in order. */
  templateParams: string[];
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

type Provider = { configured: () => boolean; send: (to: string, payload: NotificationPayload) => Promise<SendResult> };

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";

const errorText = async (res: Response) => {
  const body = await res.json().catch(() => null);
  return String(body?.error?.message ?? body?.message ?? body?.error ?? `HTTP ${res.status}`).slice(0, 300);
};

/** Email through Resend (https://resend.com). */
const resend: Provider = {
  configured: () => !!env("RESEND_API_KEY") && !!env("NOTIFY_EMAIL_FROM"),
  async send(to, payload) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("NOTIFY_EMAIL_FROM"), to: [to], subject: payload.subject, html: payload.html, text: payload.text }),
    });
    if (!res.ok) return { ok: false, error: `Email: ${await errorText(res)}` };
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: String(body.id ?? "") };
  },
};

/** WhatsApp Business Cloud API (Meta). Business-initiated messages must use an approved template. */
const metaCloud: Provider = {
  configured: () => !!env("WHATSAPP_TOKEN") && !!env("WHATSAPP_PHONE_NUMBER_ID") && !!env("WHATSAPP_TEMPLATE_NAME"),
  async send(to, payload) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: env("WHATSAPP_TEMPLATE_NAME"),
          language: { code: env("WHATSAPP_TEMPLATE_LANG") || "en" },
          components: [{ type: "body", parameters: payload.templateParams.map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `WhatsApp: ${await errorText(res)}` };
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: String(body.messages?.[0]?.id ?? "") };
  },
};

const providers: Record<Channel, Record<string, Provider>> = {
  email: { resend },
  whatsapp: { meta: metaCloud },
};

function providerFor(channel: Channel) {
  const name = env(channel === "email" ? "EMAIL_PROVIDER" : "WHATSAPP_PROVIDER") || (channel === "email" ? "resend" : "meta");
  return providers[channel][name];
}

export const isConfigured = (channel: Channel) => providerFor(channel)?.configured() ?? false;

/**
 * Sends one message. `to` is an email address, or a WhatsApp number with country code (e.g. "919876543210").
 * Never throws: failures come back as { ok: false, error }.
 */
export async function sendNotification(channel: Channel, to: string, payload: NotificationPayload): Promise<SendResult> {
  const provider = providerFor(channel);
  if (!provider || !provider.configured()) return { ok: false, error: channel === "email" ? "Email is not set up yet (missing email provider keys)." : "WhatsApp is not set up yet (missing WhatsApp Cloud API keys)." };
  try {
    return await provider.send(to, payload);
  } catch (e) {
    return { ok: false, error: `${channel === "email" ? "Email" : "WhatsApp"}: ${(e as Error).message}`.slice(0, 300) };
  }
}
