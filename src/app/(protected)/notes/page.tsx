import { createClient } from "@/lib/supabase/server";
import NotesView from "@/components/notes/NotesView";
import { StickyNote } from "lucide-react";

export default async function NotesPage() {
  const supabase = await createClient();

  const [{ data: notes }, { data: links }, { data: profiles }] = await Promise.all([
    supabase
      .from("shared_notes")
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase
      .from("useful_links")
      .select("*")
      .order("position", { ascending: true }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const count = notes?.length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Note
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{count} note condivise</span>
            <span className="hidden md:inline">{count} note condivise — appunti e link utili per entrambi.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <StickyNote className="h-5 w-5" />
        </div>
      </div>
      <NotesView
        initialNotes={notes ?? []}
        initialLinks={links ?? []}
        profiles={profiles ?? []}
      />
    </div>
  );
}
