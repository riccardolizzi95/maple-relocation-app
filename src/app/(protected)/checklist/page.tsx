import { createClient } from "@/lib/supabase/server";
import ChecklistView from "@/components/checklist/ChecklistView";
import { ListChecks } from "lucide-react";

export default async function ChecklistPage() {
  const supabase = await createClient();

  const [{ data: items }, { data: profiles }] = await Promise.all([
    supabase
      .from("checklist_items")
      .select("*")
      .order("position", { ascending: true }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const totalTasks = items?.length ?? 0;
  const doneTasks = items?.filter((t) => t.status === "fatto").length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Checklist
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{doneTasks} di {totalTasks} completati</span>
            <span className="hidden md:inline">{doneTasks} di {totalTasks} completati — gestisci i task del trasferimento.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <ListChecks className="h-5 w-5" />
        </div>
      </div>
      <ChecklistView
        initialItems={items ?? []}
        profiles={profiles ?? []}
      />
    </div>
  );
}
