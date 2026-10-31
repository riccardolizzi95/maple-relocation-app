"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Housing, HousingStatus } from "@/lib/types";
import { cn, formatCAD } from "@/lib/utils";
import { daysUntil, formatDate } from "@/lib/dates";
import { housingMonthlyCost } from "@/lib/housing-cost";
import { Card, CardContent } from "@/components/ui/card";
import FilterBar, { type FilterDef } from "@/components/ui/FilterBar";
import DetailSheet, { DetailRow } from "@/components/ui/DetailSheet";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Eye,
  Star,
  MapPin,
  DollarSign,
  ExternalLink,
  Clock,
  Home,
} from "lucide-react";
import HousingModal from "./HousingModal";

const STATUS_OPTIONS: { value: HousingStatus; label: string; dot: string; bg: string }[] = [
  { value: "da-vedere", label: "Da vedere", dot: "bg-gray-400", bg: "bg-gray-100 text-gray-600" },
  { value: "contattato", label: "Contattato", dot: "bg-blue-400", bg: "bg-blue-50 text-blue-700" },
  { value: "visto", label: "Visto", dot: "bg-purple-400", bg: "bg-purple-50 text-purple-700" },
  { value: "candidato", label: "Candidato", dot: "bg-amber-400", bg: "bg-amber-50 text-amber-700" },
  { value: "scartato", label: "Scartato", dot: "bg-red-400", bg: "bg-red-50 text-red-600" },
];

interface Props {
  initialItems: Housing[];
  airbnbEndDate: string | null;
  today: string;
}

export default function HousingView({ initialItems, airbnbEndDate, today }: Props) {
  const [items, setItems] = useState(initialItems);
  const [filterStatus, setFilterStatus] = useState<HousingStatus | "all">("all");
  const [filterNeighborhood, setFilterNeighborhood] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "price">("date");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Housing | null>(null);
  const [sheetItem, setSheetItem] = useState<Housing | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const neighborhoods = [...new Set(items.map((i) => i.neighborhood).filter(Boolean))] as string[];

  let filtered = items.filter((item) => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (filterNeighborhood !== "all" && item.neighborhood !== filterNeighborhood) return false;
    return true;
  });

  if (sortBy === "price") {
    filtered = [...filtered].sort(
      (a, b) => (housingMonthlyCost(a)?.total ?? Infinity) - (housingMonthlyCost(b)?.total ?? Infinity)
    );
  }

  const airbnbDays = airbnbEndDate ? daysUntil(airbnbEndDate, today) : null;

  function handleSaved(item: Housing) {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) return prev.map((i) => (i.id === item.id ? item : i));
      return [item, ...prev];
    });
    setModalOpen(false);
    setEditingItem(null);
    router.refresh();
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("housing").delete().eq("id", id);
    router.refresh();
  }

  async function handleStatusChange(id: string, status: HousingStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await supabase
      .from("housing")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    router.refresh();
  }

  // Media sul costo mensile equivalente (affitto + utenze + upfront/12)
  const itemCosts = items
    .map((i) => housingMonthlyCost(i))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const avgPrice = itemCosts.length > 0
    ? itemCosts.reduce((s, c) => s + c.total, 0) / itemCosts.length
    : 0;

  const filters: FilterDef[] = [
    {
      key: "status",
      label: "Tutti gli stati",
      value: filterStatus,
      options: STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
      onChange: (v) => setFilterStatus(v as HousingStatus | "all"),
    },
    ...(neighborhoods.length > 0
      ? [{
          key: "neighborhood",
          label: "Tutti i quartieri",
          value: filterNeighborhood,
          options: neighborhoods.map((n) => ({ value: n, label: n })),
          onChange: (v: string) => setFilterNeighborhood(v),
        }]
      : []),
    {
      key: "sort",
      label: "Ordina per",
      value: sortBy,
      defaultValue: "date",
      options: [
        { value: "date", label: "Per data inserimento" },
        { value: "price", label: "Per prezzo" },
      ],
      onChange: (v) => setSortBy(v as "date" | "price"),
      isSort: true,
    },
  ];

  return (
    <>
      {/* Stats row: Airbnb deadline + Average price */}
      {(airbnbDays !== null || itemCosts.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {/* Airbnb deadline (compatta) */}
          {airbnbDays !== null && (
            <Card className={cn(
              "py-0",
              airbnbDays <= 7
                ? "border-red-200 bg-red-50/50"
                : airbnbDays <= 14
                  ? "border-amber-200 bg-amber-50/50"
                  : ""
            )}>
              <CardContent className="flex items-center gap-2 px-3 py-2">
                <Clock className={cn(
                  "h-4 w-4 shrink-0",
                  airbnbDays <= 7 ? "text-red-500" : airbnbDays <= 14 ? "text-amber-500" : "text-gray-400"
                )} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight text-gray-900">
                    {airbnbDays > 0 ? `${airbnbDays}g` : airbnbDays === 0 ? "Oggi!" : "Scaduto"}
                    <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">Airbnb</span>
                  </p>
                  <p className={cn(
                    "truncate text-[10px] leading-tight",
                    airbnbDays <= 7 ? "text-red-600" : airbnbDays <= 14 ? "text-amber-600" : "text-gray-400"
                  )}>
                    scade il {formatDate(airbnbEndDate!, { day: "numeric", month: "short" })}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Average equivalent monthly cost (compatta) */}
          {itemCosts.length > 0 && (
            <Card className="py-0">
              <CardContent className="flex items-center gap-2 px-3 py-2">
                <DollarSign className="h-4 w-4 shrink-0 text-maple-500" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight text-gray-900">
                    {formatCAD(avgPrice)}
                    <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">Media</span>
                  </p>
                  <p className="truncate text-[10px] leading-tight text-gray-400">
                    equiv./mese su {itemCosts.length} alloggi
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters + Add */}
      <FilterBar
        filters={filters}
        action={
          <button
            onClick={() => { setEditingItem(null); setModalOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuovo alloggio
          </button>
        }
      />

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-gray-100 text-gray-400 mb-3">
              <Home className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-400">Nessun alloggio ancora. Aggiungine uno!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item) => (
            <HousingCard
              key={item.id}
              item={item}
              onEdit={(item) => { setEditingItem(item); setModalOpen(true); }}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onViewSheet={setSheetItem}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <HousingModal
          item={editingItem}
          onClose={() => { setModalOpen(false); setEditingItem(null); }}
          onSaved={handleSaved}
        />
      )}

      {sheetItem && (
        <HousingDetailSheet
          item={sheetItem}
          onClose={() => setSheetItem(null)}
        />
      )}
    </>
  );
}

/* ─── Housing Card (L1 + L2) ─── */

function HousingCard({
  item,
  onEdit,
  onDelete,
  onStatusChange,
  onViewSheet,
}: {
  item: Housing;
  onEdit: (item: Housing) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: HousingStatus) => void;
  onViewSheet: (item: Housing) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === item.status)!;
  const cost = housingMonthlyCost(item);
  const displayName = item.name || item.address;

  return (
    <Card className={cn(
      "transition-all duration-200",
      item.status === "scartato" && "opacity-60",
    )}>
      <CardContent className="p-0">
        {/* L1: compact row */}
        <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          {/* Status select */}
          <select
            value={item.status}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(item.id, e.target.value as HousingStatus);
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium leading-none border-0 cursor-pointer shrink-0", statusInfo.bg)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Name */}
          <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">
            {displayName}
          </span>

          {/* Rating stars (always visible) */}
          {item.rating && item.rating > 0 && (
            <span className="inline-flex items-center gap-px shrink-0">
              {Array.from({ length: item.rating }, (_, i) => (
                <Star key={i} className="h-3 w-3 text-amber-400 fill-amber-400" />
              ))}
            </span>
          )}

          {/* Neighborhood badge (desktop) */}
          {item.neighborhood && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 shrink-0">
              <MapPin className="h-3 w-3" />
              {item.neighborhood}
            </span>
          )}

          {/* Comprehensive monthly cost */}
          {cost && (
            <span className="text-sm font-semibold text-gray-900 shrink-0">
              <span className="text-xs font-normal text-gray-400">≈</span>{formatCAD(cost.total)}<span className="hidden sm:inline text-xs font-normal text-gray-400">/m</span>
            </span>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* L2: expanded */}
        {expanded && (
          <div className="border-t border-gray-100 px-3 py-2 space-y-2">
            {/* Address + mobile neighborhood */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="h-3 w-3 text-gray-400" />
              <span>{item.address}</span>
              {item.neighborhood && (
                <span className="sm:hidden rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                  {item.neighborhood}
                </span>
              )}
            </div>

            {/* Cost breakdown: base → additions → total */}
            {cost && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Affitto base</span>
                  <span className="font-medium">{formatCAD(cost.base)}</span>
                </div>
                {cost.utilities > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>+ Utenze (stima)</span>
                    <span>{formatCAD(cost.utilities)}</span>
                  </div>
                )}
                {cost.condoFees > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>+ Spese condominiali</span>
                    <span>{formatCAD(cost.condoFees)}</span>
                  </div>
                )}
                {cost.upfrontMonthly > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>+ Caparra e anticipi ÷ 12</span>
                    <span>{formatCAD(cost.upfrontMonthly)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-800">
                  <span>Costo mensile equivalente</span>
                  <span>≈ {formatCAD(cost.total)}</span>
                </div>
              </div>
            )}

            {item.offer_amount_cad && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <DollarSign className="h-3 w-3" />
                Offerta: {formatCAD(Number(item.offer_amount_cad))}
              </span>
            )}

            {/* Contract highlights */}
            {(item.furnished || item.utilities_included || item.deposit_cad || item.min_lease_months) && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {item.furnished && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    Arredato: {item.furnished === "si" ? "Sì" : item.furnished === "parziale" ? "Parziale" : "No"}
                  </span>
                )}
                {item.utilities_included && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    Utenze: {item.utilities_included === "si" ? "Incluse" : item.utilities_included === "parziale" ? "Parziali" : "Escluse"}
                  </span>
                )}
                {item.deposit_cad && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    Caparra: {formatCAD(Number(item.deposit_cad))}
                  </span>
                )}
                {item.min_lease_months && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    Min. {item.min_lease_months} mesi
                  </span>
                )}
              </div>
            )}

            {item.offer_deadline && (
              <p className="text-xs text-amber-600 font-medium">
                Scadenza offerta: {formatDate(item.offer_deadline)}
                {item.offer_notes && ` — ${item.offer_notes}`}
              </p>
            )}

            {item.pros && (
              <p className="text-sm text-emerald-700"><span className="font-medium">Pro:</span> {item.pros}</p>
            )}
            {item.cons && (
              <p className="text-sm text-red-600"><span className="font-medium">Contro:</span> {item.cons}</p>
            )}
            {item.notes && (
              <p className="text-sm text-gray-400 italic">Note: {item.notes}</p>
            )}
            {item.listing_url && (
              <a
                href={item.listing_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-sm text-maple-500 hover:text-maple-600 font-medium"
              >
                <ExternalLink className="h-3 w-3" />
                Vedi annuncio
              </a>
            )}

            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                onClick={() => onViewSheet(item)}
                className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Eye className="h-3 w-3" />
                Scheda
              </button>
              <button
                onClick={() => onEdit(item)}
                className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Modifica
              </button>
              <button
                onClick={() => { if (confirm("Eliminare questo alloggio?")) onDelete(item.id); }}
                className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Elimina
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── L3: Housing Detail Sheet (read-only) ─── */

function HousingDetailSheet({
  item,
  onClose,
}: {
  item: Housing;
  onClose: () => void;
}) {
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === item.status)!;
  const cost = housingMonthlyCost(item);

  return (
    <DetailSheet
      title={item.name || item.address}
      subtitle={[item.address, item.neighborhood].filter(Boolean).join(" · ")}
      onClose={onClose}
    >
      {/* Key facts in evidence */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gray-50 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Stato</p>
          <p className="mt-1">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.bg)}>
              {statusInfo.label}
            </span>
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Voto</p>
          <p className="mt-1.5">
            {item.rating && item.rating > 0
              ? <span className="inline-flex items-center gap-px">
                  {Array.from({ length: item.rating }, (_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                  ))}
                </span>
              : <span className="text-sm text-gray-300">—</span>
            }
          </p>
        </div>
      </div>

      {/* Cost breakdown */}
      {cost && (
        <div className="rounded-lg border border-maple-100 bg-maple-50/50 px-3 py-2.5 space-y-1 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-maple-600 mb-1.5">Costo mensile equivalente</p>
          <div className="flex justify-between text-gray-600 text-xs">
            <span>Affitto base</span>
            <span className="font-medium">{formatCAD(cost.base)}</span>
          </div>
          {cost.utilities > 0 && (
            <div className="flex justify-between text-gray-500 text-xs">
              <span>+ Utenze (stima)</span>
              <span>{formatCAD(cost.utilities)}</span>
            </div>
          )}
          {cost.condoFees > 0 && (
            <div className="flex justify-between text-gray-500 text-xs">
              <span>+ Spese condominiali</span>
              <span>{formatCAD(cost.condoFees)}</span>
            </div>
          )}
          {cost.upfrontMonthly > 0 && (
            <div className="flex justify-between text-gray-500 text-xs">
              <span>+ Caparra e anticipi ÷ 12</span>
              <span>{formatCAD(cost.upfrontMonthly)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-maple-100 pt-1.5 font-semibold text-gray-900">
            <span>Totale stimato</span>
            <span>≈ {formatCAD(cost.total)}/mese</span>
          </div>
          <p className="text-[10px] text-gray-400 pt-0.5">
            Convenzione di confronto: caparra e anticipi ripartiti su 12 mesi, non è l&apos;affitto reale.
          </p>
        </div>
      )}

      {item.listing_url && (
        <DetailRow label="Annuncio">
          <a
            href={item.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-maple-500 hover:text-maple-600 font-medium"
          >
            <ExternalLink className="h-3 w-3" />
            Apri annuncio
          </a>
        </DetailRow>
      )}

      {/* Offerta */}
      {(item.offer_amount_cad || item.offer_deadline) && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Offerta</p>
          {item.offer_amount_cad && (
            <DetailRow label="Importo">
              <span className="font-semibold text-emerald-700">{formatCAD(Number(item.offer_amount_cad))}/mese</span>
            </DetailRow>
          )}
          {item.offer_deadline && (
            <DetailRow label="Scadenza">
              {formatDate(item.offer_deadline, { day: "numeric", month: "long", year: "numeric" })}
            </DetailRow>
          )}
          {item.offer_notes && (
            <DetailRow label="Note">
              {item.offer_notes}
            </DetailRow>
          )}
        </div>
      )}

      {/* Condizioni */}
      {(item.furnished || item.utilities_included || item.deposit_cad || item.min_lease_months || item.cancellation_terms) && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Contratto</p>
          {item.furnished && (
            <DetailRow label="Arredato">
              {item.furnished === "si" ? "Sì" : item.furnished === "parziale" ? "Parziale" : "No"}
              {item.furnished_notes && ` — ${item.furnished_notes}`}
            </DetailRow>
          )}
          {item.utilities_included && (
            <DetailRow label="Utenze">
              {item.utilities_included === "si" ? "Incluse" : item.utilities_included === "parziale" ? "Parziali" : "Escluse"}
              {item.utilities_estimate_cad && ` (stima: ${formatCAD(Number(item.utilities_estimate_cad))})`}
            </DetailRow>
          )}
          {item.condo_fees_included !== null && (
            <DetailRow label="Condominio">
              {item.condo_fees_included ? "Incluse" : "Escluse"}
              {item.condo_fees_cad && ` — ${formatCAD(Number(item.condo_fees_cad))}`}
            </DetailRow>
          )}
          {item.deposit_cad && (
            <DetailRow label="Caparra">{formatCAD(Number(item.deposit_cad))}</DetailRow>
          )}
          {item.advance_months && (
            <DetailRow label="Anticipo">{item.advance_months} mesi</DetailRow>
          )}
          {item.min_lease_months && (
            <DetailRow label="Durata min.">{item.min_lease_months} mesi</DetailRow>
          )}
          {item.cancellation_terms && (
            <DetailRow label="Recesso">{item.cancellation_terms}</DetailRow>
          )}
          {item.contract_notes && (
            <DetailRow label="Note contrattuali">{item.contract_notes}</DetailRow>
          )}
        </div>
      )}

      {/* Pro/Contro/Note */}
      {(item.pros || item.cons || item.notes) && (
        <div className="pt-3 border-t border-gray-100 space-y-2">
          {item.pros && (
            <div>
              <p className="text-xs font-medium text-emerald-600 mb-0.5">Pro</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.pros}</p>
            </div>
          )}
          {item.cons && (
            <div>
              <p className="text-xs font-medium text-red-500 mb-0.5">Contro</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.cons}</p>
            </div>
          )}
          {item.notes && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-0.5">Note</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-gray-100 text-xs text-gray-300">
        Creato: {new Date(item.created_at).toLocaleDateString("it-IT")} ·
        Aggiornato: {new Date(item.updated_at).toLocaleDateString("it-IT")}
      </div>
    </DetailSheet>
  );
}
