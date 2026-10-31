"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleAlert, CloudOff, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "offline" | "warning";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const EVENT = "maple:toast";
let nextId = 1;

/** Mostra un avviso breve in basso (sopra la barra mobile). Chiamabile da qualsiasi componente client. */
export function toast(message: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: nextId++, kind, message } }));
}

const ICONS = { success: CircleCheck, error: CircleAlert, offline: CloudOff, warning: TriangleAlert };
const COLORS = {
  success: "text-emerald-500",
  error: "text-red-500",
  offline: "text-amber-500",
  warning: "text-amber-500",
};

/** Contenitore degli avvisi: montato una volta nel layout protetto. */
export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const item = (e as CustomEvent<ToastItem>).detail;
      setItems((prev) => [...prev.slice(-2), item]);
      // gli errori restano un po' di più: vanno letti
      const ms = item.kind === "success" ? 2500 : 5000;
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== item.id)), ms);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-lg ring-1 ring-foreground/10 animate-in fade-in slide-in-from-bottom-2"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", COLORS[t.kind])} />
            <p className="flex-1 text-sm text-gray-700">{t.message}</p>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="rounded p-0.5 text-gray-300 hover:text-gray-500"
              aria-label="Chiudi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
