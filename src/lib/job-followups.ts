import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysKey, daysUntil, formatDate } from "./dates";
import { sendPush } from "./push";

/**
 * Candidature senza risposta (richiesta utente 14/10):
 * - dopo 30 giorni da "Inviata" l'app suggerisce di fare un ping all'azienda
 *   (push al titolare una volta sola, e voce nella campanella);
 * - dopo 40 giorni la candidatura passa da sola a "Nessuna risposta", con una
 *   riga nelle note. Se poi l'azienda risponde, si rimette lo stato a mano.
 */
import { FOLLOWUP_DAYS, NO_RESPONSE_DAYS } from "./job-followup-rules";
export { FOLLOWUP_DAYS, NO_RESPONSE_DAYS };

/** Sposta in "nessuna-risposta" le inviate da almeno 40 giorni. Restituisce quante. */
export async function markNoResponse(supabase: SupabaseClient, today: string): Promise<number> {
  const { data, error } = await supabase
    .from("job_applications")
    .select("id, notes, applied_date")
    .eq("status", "inviata")
    .lte("applied_date", addDaysKey(today, -NO_RESPONSE_DAYS));
  if (error || !data?.length) return 0;

  let moved = 0;
  for (const j of data) {
    const days = -daysUntil(j.applied_date as string, today);
    const line = `Spostata in "Nessuna risposta" il ${formatDate(today, { day: "numeric", month: "long" })}: ${days} giorni dall'invio senza risposta.`;
    const { error: upErr } = await supabase
      .from("job_applications")
      .update({ status: "nessuna-risposta", notes: j.notes ? `${j.notes}\n${line}` : line, updated_at: new Date().toISOString() })
      .eq("id", j.id)
      .eq("status", "inviata"); // se nel frattempo qualcuno l'ha cambiata a mano, non si tocca
    if (!upErr) moved++;
  }
  return moved;
}

/** Push "fai un ping" al titolare della candidatura, una volta sola, dal 30° giorno senza risposta. */
export async function sendFollowupReminders(admin: SupabaseClient, today: string): Promise<number> {
  const { data, error } = await admin
    .from("job_applications")
    .select("id, company, role, applied_date, owner_id")
    .eq("status", "inviata")
    .lte("applied_date", addDaysKey(today, -FOLLOWUP_DAYS))
    .is("followup_reminded_at", null);
  if (error || !data?.length) return 0;

  let sent = 0;
  for (const j of data) {
    const days = -daysUntil(j.applied_date as string, today);
    if (j.owner_id) {
      await sendPush([j.owner_id], {
        title: `Un ping a ${j.company}?`,
        body: `${j.role}: inviata il ${formatDate(j.applied_date as string, { day: "numeric", month: "short" })}, nessuna risposta da ${days} giorni. Un breve messaggio al recruiter può smuovere le cose.`,
        url: `/jobs?id=${j.id}`,
        tag: `job-followup-${j.id}`,
      });
    }
    // segnato anche senza dispositivi push: il promemoria resta comunque nella campanella
    await admin.from("job_applications").update({ followup_reminded_at: new Date().toISOString() }).eq("id", j.id);
    sent++;
  }
  return sent;
}
