import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import { serverTodayKey } from "@/lib/timezone-server";
import { markNoResponse } from "@/lib/job-followups";
import JobsView from "@/components/jobs/JobsView";
import { Briefcase } from "lucide-react";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const supabase = await createClient();
  const [{ id: openId }, today] = await Promise.all([searchParams, serverTodayKey()]);

  // inviate senza risposta da 40+ giorni → "Nessuna risposta" (lo fa anche il cron ogni mattina;
  // qui serve perché la lista sia già giusta all'apertura). Di solito non tocca nessuna riga.
  await markNoResponse(supabase, today);

  const [user, { data: items }, { data: profiles }] = await Promise.all([
    getUser(),
    supabase
      .from("job_applications")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const count = items?.length ?? 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Lavoro
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{count} candidature</span>
            <span className="hidden md:inline">{count} candidature — tocca una candidatura per i dettagli e le azioni.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <Briefcase className="h-5 w-5" />
        </div>
      </div>
      <JobsView
        initialItems={items ?? []}
        profiles={profiles ?? []}
        currentUserId={user?.id ?? ""}
        today={today}
        initialOpenId={openId && items?.some((i) => i.id === openId) ? openId : null}
      />
    </div>
  );
}
