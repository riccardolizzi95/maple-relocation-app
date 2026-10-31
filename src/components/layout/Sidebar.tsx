"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import { VISIBLE_SECTIONS } from "@/lib/sections";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:border-border lg:bg-card">
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {VISIBLE_SECTIONS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-maple-50 text-maple-600"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  isActive ? "text-maple-500" : "text-gray-400"
                )}
                strokeWidth={isActive ? 2 : 1.75}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
            pathname === "/settings"
              ? "bg-maple-50 text-maple-600"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Settings className="h-[18px] w-[18px] shrink-0 text-gray-400" strokeWidth={1.75} />
          Impostazioni
        </Link>
      </div>
    </aside>
  );
}
