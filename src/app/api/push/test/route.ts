import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPush, pushConfigured } from "@/lib/push";

/** Invia una notifica di prova all'utente loggato (pulsante in Impostazioni). */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Chiavi VAPID non configurate sul server" }, { status: 503 });
  }

  const { sent } = await sendPush([user.id], {
    title: "Notifica di prova 🍁",
    body: "Le notifiche push di Maple funzionano su questo dispositivo.",
    url: "/settings",
    tag: "test",
  });
  return NextResponse.json({ ok: true, sent });
}
