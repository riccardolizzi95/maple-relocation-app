import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import { buildNotifications } from "@/lib/notifications";
import { getTimeZone } from "@/lib/timezone-server";

/**
 * Notifiche della campanella, caricate dal client dopo il mount invece
 * che nel layout: così le ~8 query non sono più nel percorso critico di
 * OGNI navigazione (l'header appare subito, il badge si popola dopo).
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ notifications: [], dismissed: [] });

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const result = await buildNotifications(supabase, user.id, profile?.role === "admin", await getTimeZone());
  return NextResponse.json(result);
}
