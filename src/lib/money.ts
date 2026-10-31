import { formatCAD, formatEUR } from "./utils";

export type DisplayCurrency = "CAD" | "EUR";

/**
 * Importi nella valuta scelta per la visualizzazione (preferenza per persona).
 * Le spese in euro usano il tasso BCE del LORO giorno (exchange_rate), così i
 * totali sono quelli veri; gli importi senza data (budget, limiti) usano il
 * tasso corrente. Tutti i calcoli interni e il DB restano in CAD.
 */
export interface Money {
  currency: DisplayCurrency;
  /** valore di una spesa/entrata nella valuta mostrata */
  of: (e: { amount_cad: number; exchange_rate: number | null }) => number;
  /** importo in CAD senza data (budget, limiti, stime) al tasso corrente */
  fromCad: (cad: number) => number;
  format: (n: number) => string;
  /** la stessa spesa nell'altra valuta, per la riga secondaria */
  formatOther: (e: { amount_cad: number; exchange_rate: number | null }) => string;
}

export function makeMoney(currency: DisplayCurrency, currentRate: number): Money {
  const rateOf = (r: number | null) => Number(r) || currentRate;
  if (currency === "EUR") {
    return {
      currency,
      of: (e) => Number(e.amount_cad) / rateOf(e.exchange_rate),
      fromCad: (cad) => cad / currentRate,
      format: formatEUR,
      formatOther: (e) => formatCAD(Number(e.amount_cad)),
    };
  }
  return {
    currency,
    of: (e) => Number(e.amount_cad),
    fromCad: (cad) => cad,
    format: formatCAD,
    formatOther: (e) => formatEUR(Number(e.amount_cad) / rateOf(e.exchange_rate)),
  };
}
