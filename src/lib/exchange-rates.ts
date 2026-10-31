import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tassi EUR→CAD di riferimento BCE (via Frankfurter, con riserva sul feed ufficiale
 * BCE). La BCE pubblica un tasso per giorno lavorativo verso le 16:00 di Francoforte:
 * nel weekend e nei festivi vale l'ultimo pubblicato (es. sabato e domenica = venerdì).
 */

const API = "https://api.frankfurter.dev/v1";
// Riserva: la fonte da cui legge anche Frankfurter (ultimi 90 giorni, ~70 KB).
// 06-07/10: dai cron Vercel Frankfurter a volte non ha risposto e il tasso del
// giorno non è stato registrato, mentre la stessa chiamata a mano funzionava.
const ECB_FEED = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface RatePoint {
  date: string;
  rate: number;
}

/** Tasso valido per una data (o l'ultimo disponibile): `date` è il giorno BCE effettivo. */
export async function fetchEcbRate(date?: string): Promise<RatePoint | null> {
  const valid = date && DATE_RE.test(date) ? date : undefined;
  const json = await frankfurter(`${valid ?? "latest"}?from=EUR&to=CAD`, 8_000);
  const rate = json?.rates?.CAD;
  if (rate) return { date: json.date, rate };

  const feed = await fetchEcbFeed();
  if (feed.length === 0) return null;
  if (!valid) return feed[feed.length - 1];
  // il feed copre solo 90 giorni: per date più vecchie non si può sapere
  return valid >= feed[0].date ? rateForDate(feed, valid) : null;
}

/** Tutti i tassi pubblicati in un intervallo (una chiamata sola). */
export async function fetchEcbSeries(from: string, to: string): Promise<RatePoint[]> {
  const json = await frankfurter(`${from}..${to}?from=EUR&to=CAD`, 10_000);
  const series = Object.entries((json?.rates ?? {}) as Record<string, { CAD?: number }>)
    .filter(([, v]) => typeof v?.CAD === "number")
    .map(([date, v]) => ({ date, rate: v.CAD! }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (series.length > 0) return series;

  const feed = await fetchEcbFeed();
  // come Frankfurter: se l'intervallo parte nel weekend serve anche l'ultimo tasso prima
  const before = feed.filter((p) => p.date < from).pop();
  return [...(before ? [before] : []), ...feed.filter((p) => p.date >= from && p.date <= to)];
}

async function frankfurter(path: string, timeoutMs: number) {
  try {
    const res = await fetch(`${API}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.warn(`[exchange-rates] Frankfurter HTTP ${res.status}, uso il feed BCE`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[exchange-rates] Frankfurter non raggiungibile, uso il feed BCE:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Feed XML ufficiale BCE: <Cube time="2026-10-06"> … <Cube currency="CAD" rate="1.6058"/> */
async function fetchEcbFeed(): Promise<RatePoint[]> {
  try {
    const res = await fetch(ECB_FEED, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`[exchange-rates] feed BCE HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const points: RatePoint[] = [];
    for (const day of xml.split(/<Cube time=["']/).slice(1)) {
      const date = day.slice(0, 10);
      const rate = Number(day.match(/currency=["']CAD["']\s+rate=["']([\d.]+)["']/)?.[1]);
      if (DATE_RE.test(date) && rate > 0) points.push({ date, rate });
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error("[exchange-rates] feed BCE non raggiungibile:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Tasso ufficiale per una data a partire da una serie ordinata: l'ultimo pubblicato fino a quel giorno. */
export function rateForDate(series: RatePoint[], date: string): RatePoint | null {
  let found: RatePoint | null = null;
  for (const p of series) {
    if (p.date > date) break;
    found = p;
  }
  return found;
}

interface ExpenseRow {
  id: string;
  date: string;
  amount_cad: number;
  exchange_rate: number | null;
  input_currency: "CAD" | "EUR" | null;
}

/**
 * Aggiornamento giornaliero (cron dopo la pubblicazione BCE):
 * 1. registra in exchange_rates gli ultimi `days` giorni (riempie anche i buchi)
 * 2. porta il tasso "corrente" di budget_settings all'ultimo pubblicato
 * 3. riallinea le spese recenti al tasso ufficiale del loro giorno: chi inserisce
 *    una spesa prima delle 16:00 di Francoforte riceve il tasso del giorno prima,
 *    qui viene corretto. Spesa inserita in CAD → cambia solo il controvalore in EUR;
 *    inserita in EUR → l'importo in euro resta quello e si ricalcola il CAD.
 */
export async function syncDailyRates(admin: SupabaseClient, today: string, days = 14) {
  const from = shiftDate(today, -days);
  const series = await fetchEcbSeries(from, today);
  if (series.length === 0) return { ok: false as const, reason: "servizio tassi non raggiungibile" };

  await admin.from("exchange_rates").upsert(series, { onConflict: "date" });

  const latest = series[series.length - 1];
  await admin
    .from("budget_settings")
    .update({ eur_cad_rate: latest.rate, updated_at: new Date().toISOString() })
    .not("id", "is", null);

  const { data: expenses } = await admin
    .from("expenses")
    .select("id, date, amount_cad, exchange_rate, input_currency")
    .gte("date", series[0].date)
    .lte("date", today);

  let realigned = 0;
  for (const e of (expenses ?? []) as ExpenseRow[]) {
    const official = rateForDate(series, e.date);
    if (!official) continue;
    const current = Number(e.exchange_rate);
    if (current && Math.abs(current - official.rate) < 0.00005) continue;
    const patch: Record<string, number> = { exchange_rate: official.rate };
    if (e.input_currency === "EUR" && current) {
      const eur = Number(e.amount_cad) / current;
      patch.amount_cad = Math.round(eur * official.rate * 100) / 100;
    }
    const { error } = await admin.from("expenses").update(patch).eq("id", e.id);
    if (!error) realigned++;
  }

  return { ok: true as const, latest, logged: series.length, realigned };
}

function shiftDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10); // calcolo su mezzanotte UTC di una data pura: nessun fuso coinvolto
}
