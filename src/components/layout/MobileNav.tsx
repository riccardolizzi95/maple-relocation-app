"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, X, Settings } from "lucide-react";
import { VISIBLE_SECTIONS, FAVORITABLE_SECTIONS } from "@/lib/sections";
import type { Section } from "@/lib/sections";

interface Props {
  favorites: string[];
}

export default function MobileNav({ favorites }: Props) {
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Con la tastiera aperta la barra si nasconde per lasciare spazio al testo
  useEffect(() => {
    function isTextField(el: EventTarget | null) {
      return el instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    }
    function onFocusIn(e: FocusEvent) {
      if (isTextField(e.target)) {
        setKeyboardOpen(true);
        document.documentElement.classList.add("kb-open");
      }
    }
    function onFocusOut() {
      // piccolo ritardo: se il focus passa a un altro campo non far "lampeggiare" la barra
      setTimeout(() => {
        if (!isTextField(document.activeElement)) {
          setKeyboardOpen(false);
          document.documentElement.classList.remove("kb-open");
        }
      }, 100);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const dashboard = VISIBLE_SECTIONS.find((s) => s.href === "/dashboard")!;

  const favoriteItems: Section[] = favorites
    .map((href) => FAVORITABLE_SECTIONS.find((s) => s.href === href))
    .filter((s): s is Section => !!s)
    .slice(0, 4);

  const barItems = [dashboard, ...favoriteItems];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Sections panel overlay */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setPanelOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-card border-t border-border p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-foreground">Tutte le sezioni</h3>
              <button
                onClick={() => setPanelOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {VISIBLE_SECTIONS.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  onClick={() => setPanelOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl p-4 transition-all",
                    isActive(section.href)
                      ? "bg-maple-50 text-maple-600"
                      : "bg-accent/50 text-muted-foreground hover:bg-accent"
                  )}
                >
                  <section.Icon className="h-5 w-5" strokeWidth={1.75} />
                  <span className="text-xs font-medium">{section.shortLabel}</span>
                </Link>
              ))}
              <Link
                href="/settings"
                onClick={() => setPanelOpen(false)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl p-4 transition-all",
                  isActive("/settings")
                    ? "bg-maple-50 text-maple-600"
                    : "bg-accent/50 text-muted-foreground hover:bg-accent"
                )}
              >
                <Settings className="h-5 w-5" strokeWidth={1.75} />
                <span className="text-xs font-medium">Opzioni</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden",
        keyboardOpen && "hidden"
      )}>
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5">
          {barItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs transition-colors",
                isActive(item.href)
                  ? "text-maple-600"
                  : "text-muted-foreground"
              )}
            >
              <item.Icon
                className="h-5 w-5"
                strokeWidth={isActive(item.href) ? 2 : 1.5}
              />
              <span className="font-medium">{item.shortLabel}</span>
            </Link>
          ))}

          {/* Sections button — always last */}
          <button
            onClick={() => setPanelOpen(true)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs transition-colors",
              panelOpen ? "text-maple-600" : "text-muted-foreground"
            )}
          >
            <LayoutGrid className="h-5 w-5" strokeWidth={1.5} />
            <span className="font-medium">Sezioni</span>
          </button>
        </div>
      </nav>
    </>
  );
}
