import { createClient } from "@/lib/supabase/server";
import ChatView from "@/components/guide/ChatView";
import { Sparkles } from "lucide-react";

export default async function GuidePage() {
  const supabase = await createClient();

  const { data: threads } = await supabase
    .from("chat_threads")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);

  const count = threads?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:gap-4">
      {/* Titolo solo su desktop: su mobile ogni pixel serve alla chat */}
      <div className="hidden md:flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Guide AI
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">{count} conversazioni</span>
            <span className="hidden md:inline">{count} conversazioni — l&apos;assistente ricorda e impara dai vostri documenti.</span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <Sparkles className="h-5 w-5" />
        </div>
      </div>
      <ChatView initialThreads={threads ?? []} />
    </div>
  );
}
