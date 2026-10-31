import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysKey, daysUntil, toDateKey, todayKey } from "./dates";
import { FOLLOWUP_DAYS } from "./job-followup-rules";

export interface AppNotification {
  id: string;
  title: string;
  sub: string;
  href: string;
  days: number | null; // giorni alla scadenza (null per eventi tipo ticket)
  urgent: boolean;
}

const DEADLINE_WINDOW = 7; // giorni: solo scadenze davvero imminenti

/**
 * Notifiche derivate lato server: scadenze imminenti (≤7g o scadute) e
 * eventi importanti (ticket risolti da verificare; ticket riaperti per gli admin).
 * Le voci eliminate dall'utente sono in user_preferences "dismissed_notifs".
 * `timeZone` è il fuso dell'utente: "oggi" e i giorni mancanti si contano lì.
 */
export async function buildNotifications(
  supabase: SupabaseClient,
  userId: string,
  isAdmin: boolean,
  timeZone: string
): Promise<{ notifications: AppNotification[]; dismissed: string[] }> {
  const today = todayKey(timeZone);

  const [
    { data: settings },
    { data: dueTasks },
    { data: dueDocs },
    { data: dueOffers },
    { data: dueInterviews },
    { data: ticketsVerify },
    { data: ticketsReopened },
    { data: dismissedPref },
    { data: silentJobs },
  ] = await Promise.all([
    supabase.from("app_settings").select("airbnb_end_date").limit(1).single(),
    supabase.from("checklist_items").select("id, title, due_date").not("due_date", "is", null).neq("status", "fatto"),
    supabase.from("documents").select("id, name, expiry_date").not("expiry_date", "is", null),
    supabase.from("housing").select("id, name, address, offer_deadline").not("offer_deadline", "is", null).neq("status", "scartato"),
    supabase
      .from("job_interviews")
      .select("id, date, interview_type, job_applications(company)")
      .not("date", "is", null)
      .gte("date", today),
    supabase.from("tickets").select("id, title").eq("status", "da-verificare").eq("created_by", userId),
    isAdmin
      ? supabase.from("tickets").select("id, title, reopen_reason").eq("status", "aperto").not("reopen_reason", "is", null)
      : Promise.resolve({ data: null }),
    supabase.from("user_preferences").select("value").eq("user_id", userId).eq("key", "dismissed_notifs").maybeSingle(),
    // candidature proprie inviate da 30+ giorni senza risposta (a 40 passano a "Nessuna risposta")
    supabase
      .from("job_applications")
      .select("id, company, applied_date")
      .eq("owner_id", userId)
      .eq("status", "inviata")
      .lte("applied_date", addDaysKey(today, -FOLLOWUP_DAYS)),
  ]);

  const candidates: AppNotification[] = [];

  const pushDeadline = (id: string, title: string, sub: string, href: string, date: string) => {
    const days = daysUntil(date, today);
    if (days > DEADLINE_WINDOW) return; // non ancora imminente
    if (days < -30) return; // scaduta da troppo: rumore
    candidates.push({ id, title, sub, href, days, urgent: days <= 2 });
  };

  for (const t of dueTasks ?? []) pushDeadline(`dl:task:${t.id}`, t.title, "Checklist", "/checklist", t.due_date as string);
  for (const d of dueDocs ?? []) pushDeadline(`dl:doc:${d.id}`, d.name, "Documento in scadenza", "/documents", d.expiry_date as string);
  for (const h of dueOffers ?? []) pushDeadline(`dl:house:${h.id}`, h.name || h.address, "Scadenza offerta", "/housing", h.offer_deadline as string);
  for (const iv of dueInterviews ?? []) {
    const company = (iv.job_applications as unknown as { company: string } | null)?.company ?? "";
    // il colloquio è un istante: il giorno va preso nel fuso dell'utente, non in UTC
    const day = toDateKey(new Date(iv.date as string), timeZone);
    if (day < today) continue;
    pushDeadline(`dl:iv:${iv.id}`, `Colloquio ${company}`.trim(), iv.interview_type ?? "Lavoro", "/jobs", day);
  }
  if (settings?.airbnb_end_date) {
    pushDeadline(`dl:airbnb:${settings.airbnb_end_date}`, "Fine Airbnb", "Alloggio", "/housing", settings.airbnb_end_date);
  }

  for (const j of silentJobs ?? []) {
    candidates.push({
      id: `job:ping:${j.id}`,
      title: `Un ping a ${j.company}?`,
      sub: `Nessuna risposta da ${-daysUntil(j.applied_date as string, today)} giorni`,
      href: `/jobs?id=${j.id}`,
      days: null,
      urgent: false,
    });
  }

  for (const t of ticketsVerify ?? []) {
    candidates.push({
      id: `tk:verify:${t.id}`,
      title: `Ticket risolto: ${t.title}`,
      sub: "Verifica e conferma la risoluzione",
      href: `/tickets?id=${t.id}`,
      days: null,
      urgent: true,
    });
  }
  for (const t of ticketsReopened ?? []) {
    candidates.push({
      id: `tk:reopen:${t.id}`,
      title: `Ticket riaperto: ${t.title}`,
      sub: t.reopen_reason ?? "Da rilavorare",
      href: `/tickets?id=${t.id}`,
      days: null,
      urgent: true,
    });
  }

  const dismissed: string[] = (dismissedPref?.value as unknown as string[]) ?? [];
  const notifications = candidates
    .filter((n) => !dismissed.includes(n.id))
    .sort((a, b) => {
      if (a.days === null && b.days !== null) return -1;
      if (b.days === null && a.days !== null) return 1;
      return (a.days ?? 0) - (b.days ?? 0);
    })
    .slice(0, 12);

  return { notifications, dismissed };
}
