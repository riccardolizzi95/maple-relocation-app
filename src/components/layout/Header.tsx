"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings, LogOut, Ticket, Users, X, ChevronRight } from "lucide-react";
import MapleLeaf from "@/components/ui/MapleLeaf";
import NotificationsBell from "./NotificationsBell";
import type { Profile } from "@/lib/types";

interface HeaderProps {
  profile: Profile | null;
  email?: string;
  userId: string;
}

export default function Header({ profile, email, userId }: HeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  const drawerLinks = [
    { href: "/tickets", label: "Ticket", desc: "Bug e migliorie", Icon: Ticket },
    // Gestione utenti solo per admin
    ...(profile?.role === "admin"
      ? [{ href: "/users", label: "Gestione utenti", desc: "Account, ruoli e accessi", Icon: Users }]
      : []),
    { href: "/settings", label: "Impostazioni", desc: "Date, budget e liste", Icon: Settings },
  ];

  return (
    // sticky top-0 a tutta larghezza e senza backdrop-filter: Safari 26 (iOS 26) lo riconosce come
    // barra superiore e ne usa il colore per la zona di stato, invece di stendere la sua sfumatura
    // di bordo sopra logo e campanella (con un header "normale" l'area appariva sfocata)
    // z-50: drawer e pannello notifiche vivono qui dentro e devono restare sopra la barra in basso (z-40)
    <header className="sticky top-0 z-50 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] lg:px-6">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-maple-50">
          <MapleLeaf className="h-4 w-4 text-maple-500" />
        </div>
        <span className="text-base font-semibold tracking-tight text-foreground">Maple</span>
      </div>

      <div className="flex items-center gap-4">
        <NotificationsBell userId={userId} />

        {/* Avatar: apre il drawer account */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-maple-50 text-xs font-semibold text-maple-600 hover:bg-maple-100 transition-colors"
        >
          {initials}
        </button>
      </div>

      {/* Drawer account (da destra, stile pannello Sezioni) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute bottom-0 right-0 top-0 flex w-80 max-w-[85vw] flex-col border-l border-border bg-card pt-[env(safe-area-inset-top)] animate-in slide-in-from-right duration-200">
            {/* Header profilo */}
            <div className="flex items-start justify-between border-b border-border px-5 pb-4 pt-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-maple-50 text-sm font-semibold text-maple-600">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {profile?.full_name ?? "Utente"}
                    {profile?.role === "admin" && (
                      <span className="ml-1.5 rounded-full bg-maple-50 px-1.5 py-0.5 text-[10px] font-medium text-maple-600">
                        Admin
                      </span>
                    )}
                  </p>
                  {email && <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>}
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Voci */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {drawerLinks.map(({ href, label, desc, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-accent"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maple-50 text-maple-500">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="truncate text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </Link>
              ))}
            </div>

            {/* Logout in fondo */}
            <div className="border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-destructive/5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <LogOut className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <span className="text-sm font-medium text-destructive">Esci</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
