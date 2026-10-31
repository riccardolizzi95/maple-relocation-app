import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonthsKey, formatDate, monthStartKey } from "./dates";
import { formatCAD } from "./utils";
import { sendPush, pushConfigured } from "./push";
import { effectiveMonthlyBudget } from "./budget";
import { CATEGORY_META } from "@/components/budget/categories";

export interface BudgetAlert {
  level: 80 | 100;
  title: string;
  body: string;
}

interface Candidate extends BudgetAlert {
  kind: "category" | "month" | "projection";
  ref: string;
}

/** "all'85%" ma "al 90%": l'articolo segue il suono del numero (80-89 = ottanta...). */
function alPercent(p: number): string {
  return p >= 80 && p < 90 ? `all'${p}%` : `al ${p}%`;
}

/** Dalla seconda settimana: prima la proiezione lineare è troppo nervosa per avvisare. */
const PROJECTION_FROM_DAY = 7;

/**
 * Controlla le soglie del mese in corso e invia (una sola volta per mese/soglia,
 * grazie a budget_alerts) le push a entrambi: categoria all'80% / oltre il limite,
 * budget mensile all'80% / superato, stima di fine mese oltre il budget.
 * Restituisce gli avvisi nuovi (il client li mostra anche come toast).
 * Richiede il client service role: budget_alerts non è scrivibile dai client.
 */
export async function checkBudgetAlerts(admin: SupabaseClient, today: string): Promise<BudgetAlert[]> {
  const monthStart = monthStartKey(today);
  const month = monthStart.slice(0, 7);
  const monthName = formatDate(monthStart, { month: "long" });

  const [{ data: expenses }, { data: settings }, { data: override }, { data: limits }] = await Promise.all([
    admin.from("expenses").select("category, amount_cad").gte("date", monthStart).lt("date", addMonthsKey(monthStart, 1)),
    admin.from("budget_settings").select("monthly_budget_cad").limit(1).maybeSingle(),
    admin.from("monthly_budgets").select("amount_cad").eq("month", month).maybeSingle(),
    admin.from("category_budgets").select("category, amount_cad"),
  ]);

  const byCategory = new Map<string, number>();
  let total = 0;
  for (const e of expenses ?? []) {
    const v = Number(e.amount_cad);
    total += v;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + v);
  }

  const candidates: Candidate[] = [];
  for (const l of limits ?? []) {
    const limit = Number(l.amount_cad);
    const spent = byCategory.get(l.category) ?? 0;
    const label = CATEGORY_META[l.category as keyof typeof CATEGORY_META]?.label ?? l.category;
    if (spent > limit) {
      candidates.push({ kind: "category", ref: l.category, level: 100, title: `Limite superato: ${label}`, body: `${formatCAD(spent)} su ${formatCAD(limit)} a ${monthName} (+${formatCAD(spent - limit)})` });
    } else if (spent >= limit * 0.8) {
      candidates.push({ kind: "category", ref: l.category, level: 80, title: `${label} ${alPercent(Math.round((spent / limit) * 100))} del limite`, body: `${formatCAD(spent)} di ${formatCAD(limit)} a ${monthName}` });
    }
  }

  // stessa regola dell'app: override del mese > somma dei limiti per categoria > budget manuale
  const budget = effectiveMonthlyBudget(settings?.monthly_budget_cad, limits ?? [], override ? Number(override.amount_cad) : null).amount;
  if (budget > 0) {
    if (total > budget) {
      candidates.push({ kind: "month", ref: "total", level: 100, title: `Budget di ${monthName} superato`, body: `${formatCAD(total)} su ${formatCAD(budget)} (+${formatCAD(total - budget)})` });
    } else if (total >= budget * 0.8) {
      candidates.push({ kind: "month", ref: "total", level: 80, title: `Budget di ${monthName} ${alPercent(Math.round((total / budget) * 100))}`, body: `${formatCAD(total)} di ${formatCAD(budget)}: restano ${formatCAD(budget - total)}` });
    } else {
      const day = Number(today.slice(8, 10));
      const [y, m] = monthStart.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const projection = (total / day) * daysInMonth;
      if (day >= PROJECTION_FROM_DAY && projection > budget) {
        candidates.push({ kind: "projection", ref: "total", level: 100, title: "A questo ritmo sforate il budget", body: `Stima di fine ${monthName}: ${formatCAD(projection)} su ${formatCAD(budget)}` });
      }
    }
  }
  if (candidates.length === 0) return [];

  // registra le soglie: tornano solo quelle MAI inviate prima (le altre sono duplicati ignorati)
  const { data: inserted, error } = await admin
    .from("budget_alerts")
    .upsert(
      candidates.map((c) => ({ month, kind: c.kind, ref: c.ref, level: c.level })),
      { onConflict: "month,kind,ref,level", ignoreDuplicates: true }
    )
    .select("kind, ref, level");
  if (error) {
    console.error("[budget-alerts]", error.message);
    return [];
  }
  const fresh = candidates.filter((c) => (inserted ?? []).some((r) => r.kind === c.kind && r.ref === c.ref && r.level === c.level));

  if (fresh.length && pushConfigured()) {
    for (const a of fresh) {
      await sendPush(null, { title: a.title, body: a.body, url: "/budget", tag: `budget-${a.kind}-${a.ref}` });
    }
  }
  return fresh.map(({ level, title, body }) => ({ level, title, body }));
}
