"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistItem, Phase, TaskStatus, Priority, Profile } from "@/lib/types";
import ModalShell from "@/components/ui/ModalShell";

const PHASES: { value: Phase; label: string }[] = [
  { value: "pre-partenza", label: "Pre-partenza" },
  { value: "prima-settimana", label: "Prima settimana" },
  { value: "primo-mese", label: "Primo mese" },
  { value: "primi-3-mesi", label: "Primi 3 mesi" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "da-fare", label: "Da fare" },
  { value: "in-corso", label: "In corso" },
  { value: "fatto", label: "Fatto" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "bassa", label: "Bassa" },
];

interface Props {
  item: ChecklistItem | null;
  profiles: Pick<Profile, "id" | "full_name">[];
  onClose: () => void;
  onSaved: (item: ChecklistItem) => void;
}

export default function TaskModal({ item, profiles, onClose, onSaved }: Props) {
  const isEditing = !!item;
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [phase, setPhase] = useState<Phase>(item?.phase ?? "primo-mese");
  const [status, setStatus] = useState<TaskStatus>(item?.status ?? "da-fare");
  const [priority, setPriority] = useState<Priority>(item?.priority ?? "media");
  const [dueDate, setDueDate] = useState(item?.due_date ?? "");
  const [assignedTo, setAssignedTo] = useState(item?.assigned_to ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload = {
      title,
      description: description || null,
      phase,
      status,
      priority,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    if (isEditing) {
      const { data, error } = await supabase
        .from("checklist_items")
        .update(payload)
        .eq("id", item.id)
        .select()
        .single();

      if (!error && data) onSaved(data as ChecklistItem);
    } else {
      const { data, error } = await supabase
        .from("checklist_items")
        .insert({ ...payload, position: 999 })
        .select()
        .single();

      if (!error && data) onSaved(data as ChecklistItem);
    }

    setLoading(false);
  }

  const inputClass =
    "mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
      >
        Annulla
      </button>
      <button
        type="submit"
        form="task-form"
        disabled={loading}
        className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
      >
        {loading ? "Salvataggio..." : isEditing ? "Salva" : "Crea"}
      </button>
    </div>
  );

  return (
    <ModalShell
      title={isEditing ? "Modifica task" : "Nuovo task"}
      onClose={onClose}
      footer={footer}
    >
        <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600">Titolo *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="es. Prenotare volo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600">Descrizione</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="Dettagli opzionali..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600">Fase</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value as Phase)}
                className={inputClass}
              >
                {PHASES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Stato</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Priorità</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={inputClass}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600">Scadenza</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600">Assegnato a</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className={inputClass}
            >
              <option value="">Nessuno</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600">Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="Note aggiuntive..."
            />
          </div>

        </form>
    </ModalShell>
  );
}
