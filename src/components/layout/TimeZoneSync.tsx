"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_TIME_ZONE, TZ_COOKIE } from "@/lib/dates";

/**
 * Comunica al server il fuso orario del dispositivo (Vercel gira in UTC):
 * - cookie `tz` → letto dalle pagine server per "oggi" e "questo mese"
 * - user_preferences "timezone" → letto dal cron per il digest push del mattino
 * Scrive solo quando il fuso cambia (es. in viaggio tra due paesi).
 */
export default function TimeZoneSync({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const match = document.cookie.match(new RegExp(`(?:^|; )${TZ_COOKIE}=([^;]*)`));
    const previous = match ? decodeURIComponent(match[1]) : null;
    if (previous === tz) return;

    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    createClient()
      .from("user_preferences")
      .upsert(
        { user_id: userId, key: "timezone", value: tz, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      )
      .then(({ error }) => {
        if (error) console.warn("[tz] salvataggio preferenza fallito:", error.message);
      });

    // la pagina è stata calcolata con un altro fuso: ricalcolala con quello giusto
    if ((previous ?? DEFAULT_TIME_ZONE) !== tz) router.refresh();
  }, [userId, router]);

  return null;
}
