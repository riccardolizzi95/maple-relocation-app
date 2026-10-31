import { createClient } from "@/lib/supabase/server";
import BudgetView from "@/components/budget/BudgetView";
import { Wallet } from "lucide-react";
import { monthStartKey } from "@/lib/dates";
import { serverTodayKey } from "@/lib/timezone-server";
import { getUser } from "@/lib/supabase/user";

export default async function BudgetPage() {
  const supabase = await createClient();

  // mese corrente nel fuso di chi usa l'app (il server gira in UTC)
  const today = await serverTodayKey();
  const startOfMonth = monthStartKey(today);

  // Spese ricorrenti: materializza le occorrenze mancanti del mese corrente
  const { data: templates } = await supabase
    .from("expenses")
    .select("id, amount_cad, category, description, created_by, date")
    .eq("recurring", true)
    .lt("date", startOfMonth);
  if (templates && templates.length > 0) {
    const { data: monthOccurrences } = await supabase
      .from("expenses")
      .select("recurring_of")
      .gte("date", startOfMonth)
      .not("recurring_of", "is", null);
    const already = new Set((monthOccurrences ?? []).map((o) => o.recurring_of));
    const missing = templates.filter((t) => !already.has(t.id));
    if (missing.length > 0) {
      const { data: latestRate } = await supabase
        .from("exchange_rates")
        .select("rate")
        .order("date", { ascending: false })
        .limit(1)
        .single();
      // upsert sull'indice unico (recurring_of, date): se due caricamenti
      // partono insieme (es. entrambi aprite Budget il 1°) non si duplica
      await supabase.from("expenses").upsert(
        missing.map((t) => ({
          amount_cad: t.amount_cad,
          category: t.category,
          description: t.description,
          date: startOfMonth,
          exchange_rate: latestRate?.rate ?? null,
          recurring: false,
          recurring_of: t.id,
          created_by: t.created_by,
        })),
        { onConflict: "recurring_of,date", ignoreDuplicates: true }
      );
    }
  }

  const user = await getUser();
  const [{ data: expenses }, { data: settings }, { data: monthlyBudgets }, { data: appSettings }, { data: chosenHousing }, { data: profiles }, { data: categoryBudgets }, { data: latestRate }, { data: incomes }, { data: currencyPref }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*")
      .order("date", { ascending: false }),
    supabase.from("budget_settings").select("*").limit(1).single(),
    supabase.from("monthly_budgets").select("*"),
    supabase.from("app_settings").select("departure_date").limit(1).single(),
    supabase.from("housing").select("*").eq("status", "candidato").limit(1).maybeSingle(),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("category_budgets").select("*"),
    supabase.from("exchange_rates").select("date, rate").order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("incomes").select("*").order("date", { ascending: false }),
    supabase.from("user_preferences").select("value").eq("user_id", user?.id ?? "").eq("key", "display_currency").maybeSingle(),
  ]);

  const expenseCount = expenses?.length ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Budget
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{expenseCount} spese registrate</span>
            <span className="hidden md:inline">{expenseCount} spese registrate — tieni d&apos;occhio il bilancio.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <Wallet className="h-5 w-5" />
        </div>
      </div>
      <BudgetView
        initialExpenses={expenses ?? []}
        initialSettings={settings ?? { id: "", monthly_budget_cad: 3000, eur_cad_rate: 1.5, updated_at: "" }}
        initialMonthlyBudgets={monthlyBudgets ?? []}
        initialCategoryBudgets={categoryBudgets ?? []}
        initialIncomes={incomes ?? []}
        initialDisplayCurrency={currencyPref?.value === "EUR" ? "EUR" : "CAD"}
        currentUserId={user?.id ?? ""}
        latestRate={latestRate ? { date: latestRate.date, rate: Number(latestRate.rate) } : null}
        currentMonthStart={startOfMonth}
        departureDate={appSettings?.departure_date ?? null}
        chosenHousing={chosenHousing ?? null}
        today={today}
        profiles={profiles ?? []}
      />
    </div>
  );
}
