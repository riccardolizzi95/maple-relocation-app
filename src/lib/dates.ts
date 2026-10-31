/**
 * Date "solo giorno" (YYYY-MM-DD, colonne Postgres `date`): sono giorni di
 * calendario, non istanti, e vanno sempre ragionate nel fuso di chi usa l'app.
 *
 * MAI usare per queste:
 * - new Date().toISOString().slice(0, 10) → è il giorno UTC: la sera a ovest di
 *   Greenwich è già "domani" (era il bug della data spesa che proponeva il giorno sbagliato)
 * - new Date("YYYY-MM-DD") → è mezzanotte UTC: a ovest di Greenwich viene mostrata come
 *   il giorno PRIMA
 *
 * Sul client il fuso è quello del dispositivo; sul server (Vercel gira in UTC)
 * arriva dal cookie `tz` scritto da TimeZoneSync (vedi lib/timezone-server.ts).
 */

export const DEFAULT_TIME_ZONE = "America/Toronto";
export const TZ_COOKIE = "tz";

const pad = (n: number) => String(n).padStart(2, "0");
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Giorno di calendario (YYYY-MM-DD) di un istante: nel fuso indicato o, senza, in quello del dispositivo. */
export function toDateKey(d: Date = new Date(), timeZone?: string): string {
  if (!timeZone) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // en-CA formatta già come YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Oggi (YYYY-MM-DD) nel fuso indicato o in quello del dispositivo. */
export function todayKey(timeZone?: string): string {
  return toDateKey(new Date(), timeZone);
}

/** "YYYY-MM-DD" → Date a mezzanotte LOCALE (niente slittamento di un giorno). I timestamp completi passano invariati. */
export function parseDateKey(value: string): Date {
  const m = DATE_KEY_RE.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** Formatta in italiano una data solo-giorno o un timestamp. */
export function formatDate(value: string, opts?: Intl.DateTimeFormatOptions): string {
  return parseDateKey(value).toLocaleDateString("it-IT", opts);
}

/** Giorni di calendario da `today` a `value` (0 = oggi, 1 = domani, -1 = ieri). */
export function daysUntil(value: string, today: string = todayKey()): number {
  const utcDay = (key: string) => {
    const [y, m, d] = key.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utcDay(value) - utcDay(today)) / 86_400_000);
}

/** Primo giorno del mese di una data: "2026-10-04" → "2026-10-01". */
export function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

/** Aritmetica sui mesi senza passare da Date (niente sorprese con fusi e ora legale). */
export function addMonthsKey(monthStart: string, n: number): string {
  const [y, m] = monthStart.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`;
}

/** Aggiunge (o toglie) giorni a una data solo-giorno, senza passare da fusi orari. */
export function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Timestamp ISO → valore per <input type="datetime-local"> nell'ora del dispositivo. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
