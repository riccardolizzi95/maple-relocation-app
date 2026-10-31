"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock } from "lucide-react";

export default function AirbnbDeadline({ currentDate }: { currentDate: string | null }) {
  const [date, setDate] = useState(currentDate ?? "");
  const [editing, setEditing] = useState(!currentDate);
  const supabase = createClient();
  const router = useRouter();

  async function handleSave() {
    if (!date) return;

    const { data: existing } = await supabase
      .from("app_settings")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      await supabase
        .from("app_settings")
        .update({ airbnb_end_date: date, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("app_settings")
        .insert({ airbnb_end_date: date });
    }

    setEditing(false);
    router.refresh();
  }

  if (!editing && currentDate) return null;

  return (
    <Card className="border-dashed border-amber-300 bg-amber-50/50">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <CalendarClock className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 mb-2">
            Imposta la data di fine Airbnb per vedere il countdown
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
            />
            <button
              onClick={handleSave}
              disabled={!date}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              Salva
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
