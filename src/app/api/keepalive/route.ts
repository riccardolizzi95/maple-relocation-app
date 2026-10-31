import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildNotifications } from "@/lib/notifications";
import { sendPush, pushConfigured } from "@/lib/push";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/dates";
import { fetchEcbRate } from "@/lib/exchange-rates";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { sendWeeklySummary } from "@/lib/weekly-summary";
import { markNoResponse, sendFollowupReminders } from "@/lib/job-followups";
import { todayKey } from "@/lib/dates";

// Chiamata dal cron Vercel (vedi vercel.json): tiene attivo Supabase,
// registra il tasso EUR→CAD del giorno e invia il digest push delle scadenze.
export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase
    .from("app_settings")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("[keepalive] query failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Registro giornaliero del tasso (best effort: non blocca il keepalive)
  let rateLogged = false;
  try {
    const admin = createAdminClient();
    if (admin) {
      const latest = await fetchEcbRate();
      if (latest) {
        await admin.from("exchange_rates").upsert(latest, { onConflict: "date" });
        rateLogged = true;
      }
    }
  } catch (err) {
    console.error("[keepalive] rate log failed:", err);
  }

  // Digest push del mattino: scadenze imminenti per ogni utente
  // (stessa logica della campanella, voci eliminate escluse)
  // Se CRON_SECRET è impostato su Vercel, il cron lo manda come Bearer:
  // così una chiamata esterna all'URL tiene vivo il DB ma non spamma push.
  const cronSecret = process.env.CRON_SECRET;
  const fromCron = !cronSecret || request.headers.get("authorization") === `Bearer ${cronSecret}`;
  let digestSent = 0;
  try {
    const admin = createAdminClient();
    if (admin && pushConfigured() && fromCron) {
      const [{ data: profiles }, { data: tzPrefs }] = await Promise.all([
        admin.from("profiles").select("id, role"),
        admin.from("user_preferences").select("user_id, value").eq("key", "timezone"),
      ]);
      // fuso di ciascun utente (salvato da TimeZoneSync): "oggi" è il suo, non quello UTC del server
      const tzByUser = new Map<string, string>();
      for (const t of tzPrefs ?? []) {
        if (typeof t.value === "string" && isValidTimeZone(t.value)) tzByUser.set(t.user_id, t.value);
      }
      for (const p of profiles ?? []) {
        const tz = tzByUser.get(p.id) ?? DEFAULT_TIME_ZONE;
        const { notifications } = await buildNotifications(admin, p.id, p.role === "admin", tz);
        const deadlines = notifications.filter((n) => n.days !== null);
        if (!deadlines.length) continue;
        const lines = deadlines.slice(0, 4).map((n) => {
          const d = n.days!;
          const when = d < 0 ? "scaduta" : d === 0 ? "oggi" : d === 1 ? "domani" : `tra ${d}g`;
          return `${n.title} — ${when}`;
        });
        const { sent } = await sendPush([p.id], {
          title: deadlines.length === 1 ? "1 scadenza imminente" : `${deadlines.length} scadenze imminenti`,
          body: lines.join("\n"),
          url: "/dashboard",
          tag: "deadline-digest",
        });
        digestSent += sent;
      }
    }
  } catch (err) {
    console.error("[keepalive] digest push failed:", err);
  }

  // Soglie del budget: di solito scattano subito dopo una spesa (/api/budget/check),
  // qui è la rete di sicurezza giornaliera (es. la stima di fine mese vale dal 7° giorno)
  let budgetAlerts = 0;
  let weeklySent = false;
  let jobsNoResponse = 0;
  let jobFollowups = 0;
  if (fromCron) {
    try {
      const admin = createAdminClient();
      if (admin) {
        const today = todayKey(DEFAULT_TIME_ZONE);
        budgetAlerts = (await checkBudgetAlerts(admin, today)).length;
        // il lunedì parte anche il riepilogo della settimana appena finita
        weeklySent = await sendWeeklySummary(admin, today);
        // candidature: prima le 40+ giorni passano a "Nessuna risposta", poi il ping alle 30-39
        jobsNoResponse = await markNoResponse(admin, today);
        jobFollowups = await sendFollowupReminders(admin, today);
      }
    } catch (err) {
      console.error("[keepalive] budget alerts / weekly failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    rateLogged,
    digestSent,
    budgetAlerts,
    weeklySent,
    jobsNoResponse,
    jobFollowups,
    // Diagnostica: solo presenza/assenza delle chiavi, mai i valori
    env: {
      nvidia: !!process.env.NVIDIA_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      tavily: !!process.env.TAVILY_API_KEY,
      vapid: pushConfigured(),
      cron_secret: !!cronSecret,
      service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
}
