import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Invia una notifica push agli utenti indicati (null = tutti gli iscritti).
 * Le sottoscrizioni scadute (404/410) vengono rimosse dal DB.
 * Solo lato server: usa il service role e la chiave VAPID privata.
 */
export async function sendPush(
  userIds: string[] | null,
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  const admin = createAdminClient();
  if (!admin) return { sent: 0, removed: 0 };

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  let query = admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (userIds) {
    if (userIds.length === 0) return { sent: 0, removed: 0 };
    query = query.in("user_id", userIds);
  }
  const { data: subs } = await query;
  if (!subs?.length) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    (subs as SubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.id);
        else console.error("[push] invio fallito:", status, sub.endpoint.slice(0, 60));
      }
    })
  );

  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length };
}
