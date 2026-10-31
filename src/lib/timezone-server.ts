import { cookies } from "next/headers";
import { DEFAULT_TIME_ZONE, TZ_COOKIE, isValidTimeZone, todayKey } from "./dates";

/**
 * Fuso orario di chi sta navigando, letto dal cookie scritto da TimeZoneSync.
 * Serve perché le funzioni Vercel girano in UTC: senza, "oggi" e "questo mese"
 * calcolati lato server sarebbero quelli UTC (la sera a ovest di Greenwich = domani).
 */
export async function getTimeZone(): Promise<string> {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

/** Oggi (YYYY-MM-DD) nel fuso di chi sta navigando. */
export async function serverTodayKey(): Promise<string> {
  return todayKey(await getTimeZone());
}
