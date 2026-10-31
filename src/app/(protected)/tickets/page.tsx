import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import TicketsView from "@/components/tickets/TicketsView";
import { Ticket } from "lucide-react";

export default async function TicketsPage() {
  const supabase = await createClient();

  const [user, { data: tickets }, { data: profiles }] = await Promise.all([
    getUser(),
    supabase.from("tickets").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const openCount = (tickets ?? []).filter((t) => t.status !== "risolto").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Ticket
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{openCount} aperti</span>
            <span className="hidden md:inline">{openCount} aperti — segnala bug e migliorie, scarica il file per Claude.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <Ticket className="h-5 w-5" />
        </div>
      </div>
      <Suspense fallback={null}>
        <TicketsView
          initialTickets={tickets ?? []}
          profiles={profiles ?? []}
          currentUserId={user?.id ?? ""}
        />
      </Suspense>
    </div>
  );
}
