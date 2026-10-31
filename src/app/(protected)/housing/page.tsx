import { createClient } from "@/lib/supabase/server";
import HousingView from "@/components/housing/HousingView";
import AirbnbDeadline from "@/components/housing/AirbnbDeadline";
import { Home } from "lucide-react";
import { serverTodayKey } from "@/lib/timezone-server";

export default async function HousingPage() {
  const supabase = await createClient();

  const [{ data: items }, { data: settings }, today] = await Promise.all([
    supabase
      .from("housing")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("app_settings").select("airbnb_end_date").limit(1).single(),
    serverTodayKey(),
  ]);

  const airbnbEndDate = settings?.airbnb_end_date ?? null;
  const count = items?.length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Alloggio
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{count} alloggi in lista</span>
            <span className="hidden md:inline">{count} alloggi in lista — cerca e confronta le opzioni.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <Home className="h-5 w-5" />
        </div>
      </div>
      <AirbnbDeadline currentDate={airbnbEndDate} />
      <HousingView
        initialItems={items ?? []}
        airbnbEndDate={airbnbEndDate}
        today={today}
      />
    </div>
  );
}
