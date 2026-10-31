"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Document } from "@/lib/types";
import EditableSelect from "@/components/ui/EditableSelect";
import ModalShell from "@/components/ui/ModalShell";

interface Props {
  document: Document | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: (doc: Document) => void;
}

export default function DocumentModal({ document: doc, currentUserId, onClose, onSaved }: Props) {
  const isEdit = !!doc;
  const [name, setName] = useState(doc?.name ?? "");
  const [category, setCategory] = useState(doc?.category ?? "");
  const [expiryDate, setExpiryDate] = useState(doc?.expiry_date ?? "");
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !category.trim()) return;
    if (!isEdit && !file) {
      setError("Seleziona un file da caricare.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let filePath = doc?.file_path ?? "";
      let fileSize = doc?.file_size ?? null;

      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const ts = Date.now();
        filePath = `uploads/${ts}_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("documents")
          .upload(filePath, file, { upsert: false });

        if (uploadErr) {
          setError(`Upload fallito: ${uploadErr.message}`);
          setSaving(false);
          return;
        }
        fileSize = file.size;

        if (isEdit && doc.file_path && doc.file_path !== filePath) {
          await supabase.storage.from("documents").remove([doc.file_path]);
        }
      }

      const payload = {
        name: name.trim(),
        category: category.trim(),
        file_path: filePath,
        file_size: fileSize,
        expiry_date: expiryDate || null,
        notes: notes.trim() || null,
        uploaded_by: isEdit ? doc.uploaded_by : currentUserId,
      };

      let result: Document;
      if (isEdit) {
        const { data, error: dbErr } = await supabase
          .from("documents")
          .update(payload)
          .eq("id", doc.id)
          .select()
          .single();
        if (dbErr) throw dbErr;
        result = data;
      } else {
        const { data, error: dbErr } = await supabase
          .from("documents")
          .insert(payload)
          .select()
          .single();
        if (dbErr) throw dbErr;
        result = data;
      }

      onSaved(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
      setSaving(false);
    }
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

  const footer = (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
      >
        Annulla
      </button>
      <button
        type="submit"
        form="document-form"
        disabled={saving}
        className="flex-1 rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
      >
        {saving ? "Salvataggio..." : isEdit ? "Salva" : "Carica"}
      </button>
    </div>
  );

  return (
    <ModalShell
      title={isEdit ? "Modifica documento" : "Nuovo documento"}
      onClose={onClose}
      footer={footer}
    >
      <form id="document-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1.5">Nome *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1.5">Categoria *</label>
          <EditableSelect
            listKey="document_category"
            value={category}
            onChange={setCategory}
            placeholder="Seleziona categoria"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1.5">
            File {isEdit ? "(sostituisci)" : "*"}
          </label>
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-maple-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-maple-600 hover:file:bg-maple-100"
          />
          {isEdit && !file && doc?.file_size && (
            <p className="mt-1 text-xs text-gray-400">File attuale: {formatSize(doc.file_size)}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1.5">Data scadenza</label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1.5">Note</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
      </form>
    </ModalShell>
  );
}
