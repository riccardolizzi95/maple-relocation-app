/**
 * Budget mensile effettivo, unica regola per riepilogo, statistiche, avvisi e impostazioni:
 * 1. budget specifico del mese (monthly_budgets), se c'è
 * 2. altrimenti, se ci sono limiti per categoria, la LORO SOMMA (fissare alloggio 2.600
 *    e spesa 1.000 vuol dire spendere al massimo 3.600 al mese)
 * 3. altrimenti il budget mensile manuale delle impostazioni
 * Le categorie senza limite contano nella spesa del mese ma non aggiungono budget.
 */
export type BudgetSource = "override" | "caps" | "manual";

export function effectiveMonthlyBudget(
  manual: number | null | undefined,
  caps: { amount_cad: number }[],
  override?: number | null
): { amount: number; source: BudgetSource; capsTotal: number } {
  const capsTotal = caps.reduce((s, c) => s + Number(c.amount_cad), 0);
  if (override !== null && override !== undefined) return { amount: Number(override), source: "override", capsTotal };
  if (capsTotal > 0) return { amount: capsTotal, source: "caps", capsTotal };
  return { amount: Number(manual) || 0, source: "manual", capsTotal };
}

export const BUDGET_SOURCE_LABEL: Record<BudgetSource, string> = {
  override: "specifico del mese",
  caps: "somma dei limiti",
  manual: "default",
};
