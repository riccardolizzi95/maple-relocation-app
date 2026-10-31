"use client";

import { useState, type ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import SlidePanel from "./SlidePanel";

export interface FilterDef {
  key: string;
  label: string;
  value: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** If true, this filter is a sort control and won't trigger the active-filter indicator */
  isSort?: boolean;
}

interface FilterBarProps {
  filters: FilterDef[];
  action?: ReactNode;
  allValue?: string;
}

function renderSelect(f: FilterDef, allValue: string, className: string) {
  const needsPlaceholder = !f.isSort && !f.options.some((o) => o.value === (f.defaultValue ?? allValue));

  return (
    <select
      value={f.value}
      onChange={(e) => f.onChange(e.target.value)}
      className={className}
    >
      {needsPlaceholder && (
        <option value={f.defaultValue ?? allValue}>{f.label}</option>
      )}
      {f.options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export default function FilterBar({ filters, action, allValue = "all" }: FilterBarProps) {
  const [open, setOpen] = useState(false);

  const realFilters = filters.filter((f) => !f.isSort);
  const hasActiveFilter = realFilters.some((f) => f.value !== (f.defaultValue ?? allValue));

  function resetFilters() {
    filters.forEach((f) => f.onChange(f.defaultValue ?? allValue));
  }

  const selectClass =
    "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  return (
    <div className="flex items-center gap-2">
      {/* Mobile: filter toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition-colors md:hidden",
          open ? "border-maple-400 text-maple-500" : "text-gray-400 hover:text-gray-600"
        )}
      >
        <Filter className="h-5 w-5" />
        {hasActiveFilter && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-maple-500 ring-2 ring-white" />
        )}
      </button>

      {/* Mobile: slide panel */}
      <SlidePanel open={open} onClose={() => setOpen(false)} title="Filtri" size="auto">
        <div className="flex flex-col gap-3">
          {filters.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">{f.label}</label>
              {renderSelect(f, allValue, `${selectClass} w-full`)}
            </div>
          ))}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => { resetFilters(); setOpen(false); }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Pulisci filtri
            </button>
          )}
        </div>
      </SlidePanel>

      {/* Desktop: inline filters */}
      <div className="hidden md:flex md:items-center md:gap-2">
        {filters.map((f) => (
          <div key={f.key}>
            {renderSelect(f, allValue, selectClass)}
          </div>
        ))}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-3 w-3" />
            Pulisci
          </button>
        )}
      </div>

      {/* Action button (always right-aligned) */}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
