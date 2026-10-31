"use client";

import { cn, formatCAD } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** limite mensile: la barra misura l'avanzamento sul limite invece che sul massimo */
  limit?: number;
  note?: string;
  Icon?: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}

/** Barre orizzontali con etichetta e valore sempre visibili (fanno anche da tabella). Usata da MonthStats e BudgetStats. */
export default function BarList({ rows, total, format = formatCAD }: { rows: BarRow[]; total: number; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const ratio = r.limit ? r.value / r.limit : r.value / max;
        const over = r.limit !== undefined && r.value > r.limit;
        const near = r.limit !== undefined && !over && ratio >= 0.8;
        return (
        <div key={r.key} className="flex items-center gap-2.5">
          {r.Icon && (
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", r.iconClass)}>
              <r.Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-gray-700">
                {r.label}
                {r.note && <span className="ml-1.5 text-xs text-gray-500">{r.note}</span>}
              </span>
              <span className="shrink-0 text-sm font-medium text-gray-900">
                {format(r.value)}
                <span className="ml-1.5 text-xs font-normal text-gray-500">
                  {r.limit !== undefined
                    ? `di ${format(r.limit)}`
                    : `${total > 0 ? Math.round((r.value / total) * 100) : 0}%`}
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
              <div
                className={cn("h-1.5 rounded-full", over ? "bg-red-500" : near ? "bg-amber-400" : "bg-maple-400")}
                style={{ width: `${Math.min(ratio, 1) * 100}%` }}
              />
            </div>
            {over && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-red-600">
                <TriangleAlert className="h-3 w-3" />
                oltre di {format(r.value - r.limit!)}
              </p>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
