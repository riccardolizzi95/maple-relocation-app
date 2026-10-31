import type { Housing } from "./types";

/**
 * Costo mensile equivalente di un alloggio, usato SOLO per confronto
 * visivo in Alloggio (card + media). Convenzione: caparra e mesi di
 * anticipo si ripartiscono su 12 mesi a prescindere dalla durata.
 * I valori grezzi restano separati nel DB: il modulo Budget attribuirà
 * caparra/anticipi al mese reale di pagamento, senza ripartirli.
 */
export interface HousingCostBreakdown {
  base: number;
  utilities: number;
  condoFees: number;
  upfrontMonthly: number; // (caparra + anticipo·affitto) / 12
  total: number;
}

export function housingMonthlyCost(item: Housing): HousingCostBreakdown | null {
  if (!item.price_cad) return null;

  const base = Number(item.price_cad);
  const utilities =
    item.utilities_included === "si" ? 0 : Number(item.utilities_estimate_cad ?? 0);
  const condoFees = item.condo_fees_included ? 0 : Number(item.condo_fees_cad ?? 0);
  const upfront =
    Number(item.deposit_cad ?? 0) + Number(item.advance_months ?? 0) * base;
  const upfrontMonthly = upfront / 12;

  return {
    base,
    utilities,
    condoFees,
    upfrontMonthly,
    total: base + utilities + condoFees + upfrontMonthly,
  };
}
