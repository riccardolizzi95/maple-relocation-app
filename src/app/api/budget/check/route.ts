import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { serverTodayKey } from "@/lib/timezone-server";

/**
 * Chiamata dal client dopo ogni spesa salvata: controlla le soglie del mese e,
 * se ne è appena stata superata una, invia la push a entrambi e la restituisce.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ alerts: [] });
  const alerts = await checkBudgetAlerts(admin, await serverTodayKey());
  return NextResponse.json({ alerts });
}
