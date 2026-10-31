import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDailyRates } from "@/lib/exchange-rates";
import { todayKey } from "@/lib/dates";

/**
 * Cron Vercel giornaliero DOPO la pubblicazione BCE (vedi vercel.json):
 * registra i tassi, aggiorna il tasso corrente e riallinea le spese recenti.
 * Solo il cron può chiamarla: Vercel invia CRON_SECRET come Bearer.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "service role mancante" }, { status: 503 });

  // i tassi BCE sono per data "europea": a quest'ora UTC coincide con quella del fuso dell'app
  const result = await syncDailyRates(admin, todayKey("UTC"));
  if (!result.ok) console.error("[rates/daily]", result.reason);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
