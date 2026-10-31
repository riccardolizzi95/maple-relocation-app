import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysKey, parseDateKey } from "./dates";
import { formatCAD, formatEUR } from "./utils";
import { sendPush, pushConfigured } from "./push";
import { CATEGORY_META } from "@/components/budget/categories";

export interface WeeklySummary {
  title: string;
  body: string;
}

/**
 * Riepilogo della settimana appena finita (lunedì-domenica), da mandare il lunedì
 * mattina: totale con equivalente in euro, confronto con la settimana prima,
 * categoria più grande e quella cresciuta di più. Calcolo puro, senza invio.
 */
export function buildWeeklySummary(
  expenses: { date: string; category: string; amount_cad: number }[],
  monday: string,
  eurRate: number
): WeeklySummary | null {
  const lastStart = addDaysKey(monday, -7);
  const prevStart = addDaysKey(monday, -14);
  const sum = (from: string, to: string) => {
    const byCat = new Map<string, number>();
    let total = 0;
    for (const e of expenses) {
      if (e.date < from || e.date >= to) continue;
      const v = Number(e.amount_cad);
      total += v;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + v);
    }
    return { total, byCat };
  };
  const last = sum(lastStart, monday);
  const prev = sum(prevStart, lastStart);
  if (last.total <= 0) return null;

  const label = (c: string) => CATEGORY_META[c as keyof typeof CATEGORY_META]?.label ?? c;
  const parts: string[] = [];
  if (prev.total > 0) {
    const pct = Math.round(((last.total - prev.total) / prev.total) * 100);
    parts.push(pct === 0 ? "come la settimana prima" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% rispetto alla settimana prima`);
  }
  const top = [...last.byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) parts.push(`di più in ${label(top[0])} (${formatCAD(top[1])})`);
  if (prev.total > 0) {
    const grew = [...last.byCat.entries()]
      .map(([c, v]) => [c, v - (prev.byCat.get(c) ?? 0)] as const)
      .filter(([, d]) => d >= 10)
      .sort((a, b) => b[1] - a[1])[0];
    if (grew && grew[0] !== top?.[0]) parts.push(`in aumento ${label(grew[0])} (+${formatCAD(grew[1])})`);
  }

  const from = parseDateKey(lastStart).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const to = parseDateKey(addDaysKey(monday, -1)).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return {
    title: `Settimana ${from} – ${to}: ${formatCAD(last.total)} (≈ ${formatEUR(last.total / eurRate)})`,
    body: parts.length ? parts.join(" · ") : "Apri il Budget per i dettagli",
  };
}

/** Il lunedì: calcola e invia il riepilogo a entrambi, una sola volta per settimana. */
export async function sendWeeklySummary(admin: SupabaseClient, today: string): Promise<boolean> {
  if (parseDateKey(today).getDay() !== 1) return false;
  const [{ data: expenses }, { data: settings }] = await Promise.all([
    admin.from("expenses").select("date, category, amount_cad").gte("date", addDaysKey(today, -14)).lt("date", today),
    admin.from("budget_settings").select("eur_cad_rate").limit(1).maybeSingle(),
  ]);
  const summary = buildWeeklySummary(expenses ?? [], today, Number(settings?.eur_cad_rate) || 1.5);
  if (!summary) return false;

  const weekStart = addDaysKey(today, -7);
  const { data: inserted } = await admin
    .from("budget_alerts")
    .upsert({ month: weekStart.slice(0, 7), kind: "weekly", ref: weekStart, level: 0 }, { onConflict: "month,kind,ref,level", ignoreDuplicates: true })
    .select("ref");
  if (!inserted?.length) return false; // già inviato

  if (pushConfigured()) await sendPush(null, { title: summary.title, body: summary.body, url: "/budget", tag: "weekly-summary" });
  return true;
}
