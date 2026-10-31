"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LookupValue } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  listKey: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
}

export default function EditableSelect({ listKey, value, onChange, placeholder = "Seleziona...", className, allowEmpty = true }: Props) {
  const [options, setOptions] = useState<LookupValue[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("lookup_values")
      .select("*")
      .eq("list_key", listKey)
      .order("position")
      .then(({ data }) => setOptions(data ?? []));
  }, [listKey, supabase]);

  useEffect(() => {
    if (showCustom && inputRef.current) inputRef.current.focus();
  }, [showCustom]);

  async function handleSaveCustom() {
    const trimmed = customValue.trim();
    if (!trimmed) return;
    setSaving(true);

    const maxPos = options.length > 0 ? Math.max(...options.map((o) => o.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("lookup_values")
      .upsert({ list_key: listKey, value: trimmed, position: maxPos }, { onConflict: "list_key,value" })
      .select()
      .single();

    if (!error && data) {
      setOptions((prev) => {
        if (prev.find((o) => o.id === data.id)) return prev;
        return [...prev, data as LookupValue];
      });
      onChange(trimmed);
    }

    setShowCustom(false);
    setCustomValue("");
    setSaving(false);
  }

  if (showCustom) {
    return (
      <div className={cn("flex gap-1", className)}>
        <input
          ref={inputRef}
          type="text"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSaveCustom(); }
            if (e.key === "Escape") { setShowCustom(false); setCustomValue(""); }
          }}
          disabled={saving}
          placeholder="Nuovo valore..."
          className="flex-1 min-w-0 rounded-lg border border-maple-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={handleSaveCustom}
          disabled={saving || !customValue.trim()}
          className="rounded-lg bg-maple-500 px-2.5 py-2 text-sm font-medium text-white hover:bg-maple-600 disabled:opacity-50 transition-colors"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => { setShowCustom(false); setCustomValue(""); }}
          className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ✗
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setShowCustom(true);
        } else {
          onChange(e.target.value);
        }
      }}
      className={cn(
        "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors",
        className
      )}
    >
      {/* senza scelta il menu mostrava la prima voce ma il valore restava vuoto
          (e chi salva perdeva la riga): ora si vede che manca */}
      {allowEmpty ? <option value="">{placeholder}</option> : !value && <option value="" disabled>{placeholder}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.value}>{o.value}</option>
      ))}
      {/* valore salvato che nel frattempo è stato tolto dalla lista: resta visibile */}
      {value && options.length > 0 && !options.some((o) => o.value === value) && <option value={value}>{value}</option>}
      <option value="__custom__">Altro…</option>
    </select>
  );
}
