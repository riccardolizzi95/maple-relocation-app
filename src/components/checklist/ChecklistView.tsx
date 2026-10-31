"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { ChecklistItem, Phase, TaskStatus, Priority, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import FilterBar, { type FilterDef } from "@/components/ui/FilterBar";
import DetailSheet, { DetailRow } from "@/components/ui/DetailSheet";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  CircleAlert,
  CircleMinus,
  CircleCheck,
  User,
  Calendar,
  Eye,
} from "lucide-react";
import TaskModal from "./TaskModal";
import SwipeRow from "@/components/ui/SwipeRow";

const PHASES: { value: Phase; label: string }[] = [
  { value: "pre-partenza", label: "Pre-partenza" },
  { value: "prima-settimana", label: "Prima settimana" },
  { value: "primo-mese", label: "Primo mese" },
  { value: "primi-3-mesi", label: "Primi 3 mesi" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string; dot: string; bg: string }[] = [
  { value: "da-fare", label: "Da fare", dot: "bg-gray-400", bg: "bg-gray-100 text-gray-600" },
  { value: "in-corso", label: "In corso", dot: "bg-amber-400", bg: "bg-amber-50 text-amber-700" },
  { value: "fatto", label: "Fatto", dot: "bg-emerald-500", bg: "bg-emerald-50 text-emerald-700" },
];

const PRIORITY_CONFIG: Record<Priority, { icon: typeof CircleAlert; color: string; label: string }> = {
  alta: { icon: CircleAlert, color: "text-red-500", label: "Alta" },
  media: { icon: CircleMinus, color: "text-amber-500", label: "Media" },
  bassa: { icon: CircleCheck, color: "text-emerald-500", label: "Bassa" },
};

interface Props {
  initialItems: ChecklistItem[];
  profiles: Pick<Profile, "id" | "full_name">[];
}

export default function ChecklistView({ initialItems, profiles }: Props) {
  const [items, setItems] = useState(initialItems);
  const [filterPhase, setFilterPhase] = useState<Phase | "all">("all");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [sheetItem, setSheetItem] = useState<ChecklistItem | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const filtered = items.filter((item) => {
    if (filterPhase !== "all" && item.phase !== filterPhase) return false;
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    return true;
  });

  const grouped = PHASES.map((phase) => ({
    ...phase,
    items: filtered.filter((item) => item.phase === phase.value),
  }));

  const totalTasks = items.length;
  const doneTasks = items.filter((t) => t.status === "fatto").length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  async function handleStatusChange(id: string, status: TaskStatus) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
    await supabase
      .from("checklist_items")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    router.refresh();
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await supabase.from("checklist_items").delete().eq("id", id);
    router.refresh();
  }

  function handleSaved(item: ChecklistItem) {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.map((i) => (i.id === item.id ? item : i));
      }
      return [...prev, item];
    });
    setModalOpen(false);
    setEditingItem(null);
    router.refresh();
  }

  const filters: FilterDef[] = [
    {
      key: "phase",
      label: "Tutte le fasi",
      value: filterPhase,
      options: PHASES.map((p) => ({ value: p.value, label: p.label })),
      onChange: (v) => setFilterPhase(v as Phase | "all"),
    },
    {
      key: "status",
      label: "Tutti gli stati",
      value: filterStatus,
      options: STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
      onChange: (v) => setFilterStatus(v as TaskStatus | "all"),
    },
  ];

  return (
    <>
      {/* Progress bar (compatta: una riga) */}
      <Card className="py-0">
        <CardContent className="px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs font-medium text-gray-500">
              {doneTasks}/{totalTasks}
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-maple-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold text-maple-600">{progress}%</span>
            <div className="hidden sm:flex items-center gap-3 shrink-0 pl-2">
              {STATUS_OPTIONS.map((s) => {
                const count = items.filter((i) => i.status === s.value).length;
                return (
                  <span key={s.value} className="flex items-center gap-1 text-[11px] text-gray-400">
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                    {count}
                  </span>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters + Add button */}
      <FilterBar
        filters={filters}
        action={
          <button
            onClick={() => {
              setEditingItem(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuovo task
          </button>
        }
      />

      {/* Task list grouped by phase */}
      <div className="space-y-6">
        {grouped.map((phase) => {
          if (phase.items.length === 0 && filterPhase !== "all" && filterPhase !== phase.value) return null;
          return (
            <div key={phase.value}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {phase.label}
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                  {phase.items.length}
                </span>
              </h2>

              {phase.items.length === 0 ? (
                <p className="text-sm text-gray-300 italic">Nessun task in questa fase</p>
              ) : (
                <div className="space-y-1.5">
                  {phase.items.map((item) => (
                    <TaskCard
                      key={item.id}
                      item={item}
                      profiles={profiles}
                      onStatusChange={handleStatusChange}
                      onEdit={(item) => {
                        setEditingItem(item);
                        setModalOpen(true);
                      }}
                      onDelete={handleDelete}
                      onViewSheet={setSheetItem}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit/Create Modal */}
      {modalOpen && (
        <TaskModal
          item={editingItem}
          profiles={profiles}
          onClose={() => {
            setModalOpen(false);
            setEditingItem(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* L3: Detail Sheet (read-only) */}
      {sheetItem && (
        <TaskDetailSheet
          item={sheetItem}
          profiles={profiles}
          onClose={() => setSheetItem(null)}
        />
      )}
    </>
  );
}

/* ─── Task Card (L1 + L2) ─── */

function TaskCard({
  item,
  profiles,
  onStatusChange,
  onEdit,
  onDelete,
  onViewSheet,
}: {
  item: ChecklistItem;
  profiles: Pick<Profile, "id" | "full_name">[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onEdit: (item: ChecklistItem) => void;
  onDelete: (id: string) => void;
  onViewSheet: (item: ChecklistItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const assignee = profiles.find((p) => p.id === item.assigned_to);
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === item.status)!;
  const priorityConfig = PRIORITY_CONFIG[item.priority];
  const PriorityIcon = priorityConfig.icon;

  return (
    <Card className={cn(
      "transition-all duration-200",
      item.status === "fatto" && "opacity-70",
    )}>
      <CardContent className="relative overflow-hidden p-0">
        {/* L1: single-row compact view — swipe mobile: destra = completa, sinistra = elimina */}
        <SwipeRow
          className="flex items-center gap-2 bg-card px-3 py-2"
          toRight={{
            Icon: CircleCheck,
            bg: "bg-emerald-50",
            idle: "text-emerald-300",
            active: "text-emerald-600",
            onTrigger: () => onStatusChange(item.id, item.status === "fatto" ? "da-fare" : "fatto"),
          }}
          toLeft={{
            Icon: Trash2,
            bg: "bg-red-50",
            idle: "text-red-300",
            active: "text-red-600",
            onTrigger: () => { if (confirm("Eliminare questo task?")) onDelete(item.id); },
          }}
        >
          {/* Status cycling button */}
          <button
            onClick={() => {
              const next: Record<TaskStatus, TaskStatus> = {
                "da-fare": "in-corso",
                "in-corso": "fatto",
                "fatto": "da-fare",
              };
              onStatusChange(item.id, next[item.status]);
            }}
            className={cn(
              "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              item.status === "fatto"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : item.status === "in-corso"
                  ? "border-amber-400 bg-amber-50"
                  : "border-gray-300 hover:border-gray-400"
            )}
          >
            {item.status === "fatto" && (
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {item.status === "in-corso" && (
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </button>

          <PriorityIcon className={cn("h-3.5 w-3.5 shrink-0", priorityConfig.color)} />

          {/* Title (click to expand) */}
          <span
            className={cn(
              "flex-1 min-w-0 truncate text-sm font-medium cursor-pointer",
              item.status === "fatto" ? "text-gray-400 line-through" : "text-gray-800"
            )}
            onClick={() => setExpanded(!expanded)}
          >
            {item.title}
          </span>

          {/* Inline meta (desktop only) */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium leading-none", statusInfo.bg)}>
              {statusInfo.label}
            </span>
            {assignee && (
              <span className="inline-flex items-center gap-1 rounded-full bg-maple-50 px-2 py-0.5 text-[11px] font-medium leading-none text-maple-600">
                <User className="h-3 w-3" />
                {assignee.full_name}
              </span>
            )}
            {item.due_date && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                <Calendar className="h-3 w-3" />
                {formatDate(item.due_date)}
              </span>
            )}
          </div>

          {/* Mobile: just status badge */}
          <span className={cn("sm:hidden rounded-full px-2 py-0.5 text-[11px] font-medium leading-none shrink-0", statusInfo.bg)}>
            {statusInfo.label}
          </span>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </SwipeRow>

        {/* L2: expanded details */}
        {expanded && (
          <div className="border-t border-gray-100 px-3 py-2 space-y-1.5">
            {/* Mobile meta (shown only on expand) */}
            <div className="flex sm:hidden flex-wrap items-center gap-1.5">
              {assignee && (
                <span className="inline-flex items-center gap-1 rounded-full bg-maple-50 px-2 py-0.5 text-[11px] font-medium text-maple-600">
                  <User className="h-3 w-3" />
                  {assignee.full_name}
                </span>
              )}
              {item.due_date && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.due_date)}
                </span>
              )}
            </div>
            {item.description && (
              <p className="text-sm text-gray-600">{item.description}</p>
            )}
            {item.notes && (
              <p className="text-sm text-gray-400 italic">Note: {item.notes}</p>
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
                onClick={() => {
                  if (confirm("Eliminare questo task?")) onDelete(item.id);
                }}
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

/* ─── L3: Task Detail Sheet (read-only) ─── */

function TaskDetailSheet({
  item,
  profiles,
  onClose,
}: {
  item: ChecklistItem;
  profiles: Pick<Profile, "id" | "full_name">[];
  onClose: () => void;
}) {
  const assignee = profiles.find((p) => p.id === item.assigned_to);
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === item.status)!;
  const priorityConfig = PRIORITY_CONFIG[item.priority];
  const phaseLabel = PHASES.find((p) => p.value === item.phase)?.label ?? item.phase;

  return (
    <DetailSheet title={item.title} subtitle={phaseLabel} onClose={onClose}>
      <DetailRow label="Stato">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.bg)}>
          {statusInfo.label}
        </span>
      </DetailRow>

      <DetailRow label="Priorità">
        <span className={cn("inline-flex items-center gap-1.5 text-sm", priorityConfig.color)}>
          {priorityConfig.label}
        </span>
      </DetailRow>

      <DetailRow label="Fase">
        {phaseLabel}
      </DetailRow>

      <DetailRow label="Assegnato a">
        {assignee ? assignee.full_name : <span className="text-gray-300">—</span>}
      </DetailRow>

      <DetailRow label="Scadenza">
        {item.due_date
          ? formatDate(item.due_date, { day: "numeric", month: "long", year: "numeric" })
          : <span className="text-gray-300">—</span>
        }
      </DetailRow>

      {item.description && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-400 mb-1">Descrizione</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>
        </div>
      )}

      {item.notes && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-400 mb-1">Note</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}

      <div className="pt-2 border-t border-gray-100 text-xs text-gray-300">
        Creato: {new Date(item.created_at).toLocaleDateString("it-IT")} ·
        Aggiornato: {new Date(item.updated_at).toLocaleDateString("it-IT")}
      </div>
    </DetailSheet>
  );
}
