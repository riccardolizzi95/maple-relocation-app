"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/notifications";
import { Bell, X, BadgeCheck, CalendarClock, RotateCcw } from "lucide-react";

interface Props {
  userId: string;
}

export default function NotificationsBell({ userId }: Props) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Carica le notifiche dopo il mount: non pesano più sul render di ogni pagina.
  useEffect(() => {
    let alive = true;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : { notifications: [], dismissed: [] }))
      .then((data) => {
        if (!alive) return;
        setNotifications(data.notifications ?? []);
        setDismissed(data.dismissed ?? []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function persistDismissed(next: string[]) {
    setDismissed(next);
    await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        key: "dismissed_notifs",
        value: next as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" }
    );
  }

  function dismissOne(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    persistDismissed([...dismissed, id]);
  }

  function dismissAll() {
    const ids = notifications.map((n) => n.id);
    setNotifications([]);
    persistDismissed([...dismissed, ...ids]);
    setOpen(false);
  }

  function openNotification(n: AppNotification) {
    setOpen(false);
    // la notifica sparisce una volta aperta
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    persistDismissed([...dismissed, n.id]);
    router.push(n.href);
  }

  const iconFor = (n: AppNotification) => {
    if (n.id.startsWith("tk:verify")) return <BadgeCheck className="h-4 w-4 text-purple-500" />;
    if (n.id.startsWith("tk:reopen")) return <RotateCcw className="h-4 w-4 text-amber-500" />;
    return <CalendarClock className={cn("h-4 w-4", n.urgent ? "text-red-500" : "text-amber-500")} />;
  };

  const daysBadge = (n: AppNotification) => {
    if (n.days === null) return null;
    const label = n.days < 0 ? `${Math.abs(n.days)}g fa` : n.days === 0 ? "Oggi" : `${n.days}g`;
    return (
      <span className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        n.days < 0 ? "bg-red-50 text-red-600" : n.days <= 2 ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"
      )}>
        {label}
      </span>
    );
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-full transition-colors",
          open ? "bg-maple-50 text-maple-600" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        )}
        title="Notifiche"
      >
        <Bell className="h-5 w-5" />
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-maple-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-card">
            {notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-foreground">Notifiche</p>
            {notifications.length > 0 && (
              <button
                onClick={dismissAll}
                className="text-[11px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
              >
                Pulisci tutte
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-300">
              Nessuna notifica: tutto sotto controllo.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="group flex cursor-pointer items-start gap-2.5 px-4 py-2.5 hover:bg-accent/60 transition-colors"
                  onClick={() => openNotification(n)}
                >
                  <span className="mt-0.5 shrink-0">{iconFor(n)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{n.title}</p>
                    <p className="truncate text-[11px] text-gray-400">{n.sub}</p>
                  </div>
                  {daysBadge(n)}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissOne(n.id); }}
                    className="shrink-0 rounded-full p-1 text-gray-300 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                    title="Elimina notifica"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
