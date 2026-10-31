import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchEcbRate } from "@/lib/exchange-rates";

/**
 * Tasso BCE EUR→CAD valido per una data (?date=YYYY-MM-DD) o l'ultimo pubblicato.
 * `date` nella risposta è il giorno BCE effettivo (nel weekend = venerdì).
 * Se il servizio esterno non risponde usa lo storico salvato nel DB.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("date");
  // solo YYYY-MM-DD: il valore finisce nel path dell'URL esterno
  const dateParam = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;

  const live = await fetchEcbRate(dateParam ?? undefined);
  if (live) return NextResponse.json({ rate: live.rate, source: "bce", date: live.date });

  const supabase = await createClient();
  let query = supabase.from("exchange_rates").select("date, rate").order("date", { ascending: false }).limit(1);
  if (dateParam) query = query.lte("date", dateParam);
  const { data } = await query.maybeSingle();
  if (data) return NextResponse.json({ rate: Number(data.rate), source: "storico", date: data.date });

  console.error(`[exchange-rate] nessun tasso disponibile per ${dateParam ?? "oggi"}`);
  return NextResponse.json({ rate: 1.5, source: "fallback", date: dateParam });
}
