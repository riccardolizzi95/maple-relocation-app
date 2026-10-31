import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import DocumentsView from "@/components/documents/DocumentsView";
import { FileText } from "lucide-react";
import { serverTodayKey } from "@/lib/timezone-server";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const [user, { data: documents }, { data: profiles }, today] = await Promise.all([
    getUser(),
    supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
    serverTodayKey(),
  ]);

  const count = documents?.length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Documenti
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{count} documenti</span>
            <span className="hidden md:inline">{count} documenti — file importanti sempre a portata di mano.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <FileText className="h-5 w-5" />
        </div>
      </div>
      <DocumentsView
        initialDocuments={documents ?? []}
        profiles={profiles ?? []}
        currentUserId={user?.id ?? ""}
        today={today}
      />
    </div>
  );
}
