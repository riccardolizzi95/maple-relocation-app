import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import SettingsView from "@/components/settings/SettingsView";
import { Settings } from "lucide-react";

export default async function SettingsPage() {
  const supabase = await createClient();

  const [user, { data: lookups }, { data: appSettings }, { data: budgetSettings }, { data: favPref }, { data: caps }] =
    await Promise.all([
      getUser(),
      supabase.from("lookup_values").select("*").order("list_key").order("position"),
      supabase.from("app_settings").select("*").limit(1).single(),
      supabase.from("budget_settings").select("*").limit(1).single(),
      supabase
        .from("user_preferences")
        .select("*")
        .eq("key", "mobile_favorites")
        .single(),
      supabase.from("category_budgets").select("amount_cad"),
    ]);

  const mobileFavorites: string[] = (favPref?.value as unknown as string[]) ?? [];

  const { data: rates } = await supabase
    .from("exchange_rates")
    .select("date, rate")
    .order("date", { ascending: true });


  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Impostazioni
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">Date, budget e liste</span>
            <span className="hidden md:inline">Date chiave, budget, navigazione e liste personalizzabili.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <Settings className="h-5 w-5" />
        </div>
      </div>
      <SettingsView
        initialLookups={lookups ?? []}
        initialAppSettings={appSettings ?? { id: "", departure_date: null, airbnb_end_date: null, updated_at: "" }}
        initialBudgetSettings={budgetSettings ?? { id: "", monthly_budget_cad: 3000, eur_cad_rate: 1.5, updated_at: "" }}
        currentUserId={user?.id ?? ""}
        categoryCapsTotal={(caps ?? []).reduce((s, c) => s + Number(c.amount_cad), 0)}
        initialMobileFavorites={mobileFavorites}
        rates={(rates ?? []) as { date: string; rate: number }[]}
      />
    </div>
  );
}
