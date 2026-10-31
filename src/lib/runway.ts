import type { Expense, Income } from "./types";
import { daysUntil } from "./dates";

/**
 * Autonomia dei risparmi: saldo stimato oggi e per quanti mesi basta al ritmo
 * di spesa recente. Il saldo parte da quello inserito a mano (a fine giornata
 * della sua data) e si aggiorna da solo: − spese successive + entrate successive.
 * Tutto è calcolato nella valuta dei risparmi; le conversioni usano il tasso
 * salvato su ogni movimento (quello BCE del suo giorno).
 */

const DAYS_PER_MONTH = 30.44;
const WINDOW_DAYS = 30;

export interface RunwayInput {
  savingsAmount: number;
  savingsCurrency: "EUR" | "CAD";
  savingsDate: string;
  expenses: Pick<Expense, "date" | "amount_cad" | "exchange_rate" | "category">[];
  incomes: Pick<Income, "date" | "amount_cad" | "exchange_rate">[];
  today: string;
  departureDate: string | null;
  fallbackRate: number;
  /** costo mensile dell'alloggio scelto (CAD), usato solo se negli ultimi 30 giorni non c'è affitto */
  chosenHousingMonthlyCad: number | null;
}

export interface RunwayResult {
  balance: number;
  monthlyBurn: number;
  months: number | null;
  untilDate: string | null;
  windowDays: number;
  /** affitto stimato aggiunto alla media (alloggio scelto, ma niente affitto pagato nel periodo) */
  rentAdded: number;
  /** nessun affitto negli ultimi 30 giorni e nessun alloggio scelto: la stima è ottimistica */
  rentMissing: boolean;
}

export function computeRunway(i: RunwayInput): RunwayResult {
  const toSavings = (amountCad: number, rate: number | null) =>
    i.savingsCurrency === "EUR" ? Number(amountCad) / (Number(rate) || i.fallbackRate) : Number(amountCad);

  let balance = i.savingsAmount;
  for (const e of i.expenses) if (e.date > i.savingsDate && e.date <= i.today) balance -= toSavings(e.amount_cad, e.exchange_rate);
  for (const n of i.incomes) if (n.date > i.savingsDate && n.date <= i.today) balance += toSavings(n.amount_cad, n.exchange_rate);

  // ritmo di spesa: ultimi 30 giorni, ma mai prima della partenza (le spese prima del trasferimento non contano)
  const sinceDeparture = i.departureDate ? -daysUntil(i.departureDate, i.today) + 1 : WINDOW_DAYS;
  const windowDays = Math.max(1, Math.min(WINDOW_DAYS, sinceDeparture));
  const inWindow = i.expenses.filter((e) => {
    const age = -daysUntil(e.date, i.today);
    return age >= 0 && age < windowDays;
  });
  const spent = inWindow.reduce((s, e) => s + toSavings(e.amount_cad, e.exchange_rate), 0);

  const paidRent = inWindow.some((e) => e.category === "alloggio");
  const rentAdded = !paidRent && i.chosenHousingMonthlyCad ? toSavings(i.chosenHousingMonthlyCad, null) : 0;
  const monthlyBurn = (spent / windowDays) * DAYS_PER_MONTH + rentAdded;

  const months = monthlyBurn > 0 ? Math.max(0, balance) / monthlyBurn : null;
  let untilDate: string | null = null;
  if (months !== null) {
    const [y, m, d] = i.today.split("-").map(Number);
    untilDate = new Date(Date.UTC(y, m - 1, d + Math.floor(months * DAYS_PER_MONTH))).toISOString().slice(0, 10);
  }
  return { balance, monthlyBurn, months, untilDate, windowDays, rentAdded, rentMissing: !paidRent && !i.chosenHousingMonthlyCad };
}
