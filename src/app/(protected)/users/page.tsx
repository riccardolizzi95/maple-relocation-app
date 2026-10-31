import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import UsersManagement from "@/components/users/UsersManagement";
import { Users } from "lucide-react";

export default async function UsersPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Sezione riservata agli admin: chi non lo è torna alla dashboard
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Gestione utenti
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="md:hidden">Account, ruoli e accessi</span>
            <span className="hidden md:inline">
              Crea account, assegna ruoli, reimposta password e controlla gli accessi.
            </span>
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500">
          <Users className="h-5 w-5" />
        </div>
      </div>

      <UsersManagement currentUserId={user.id} />
    </div>
  );
}
