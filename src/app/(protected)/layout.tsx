import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import Header from "@/components/layout/Header";
import TimeZoneSync from "@/components/layout/TimeZoneSync";
import Toaster from "@/components/ui/Toaster";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_preferences")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "mobile_favorites")
      .single(),
  ]);

  const mobileFavorites: string[] = (prefs?.value as unknown as string[]) ?? [];

  // Le notifiche non si calcolano più qui: la campanella le carica dal
  // client dopo il mount (/api/notifications), fuori dal percorso critico.
  return (
    <div className="flex flex-col h-full">
      <TimeZoneSync userId={user.id} />
      <Header
        profile={profile}
        email={user.email}
        userId={user.id}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-6">
          {children}
        </main>
      </div>
      <MobileNav favorites={mobileFavorites} />
      <Toaster />
    </div>
  );
}
