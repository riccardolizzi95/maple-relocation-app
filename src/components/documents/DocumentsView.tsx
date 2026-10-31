"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Document, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { daysUntil, formatDate } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import FilterBar, { type FilterDef } from "@/components/ui/FilterBar";
import {
  Plus,
  FileText,
  ExternalLink,
  Download,
  Pencil,
  Trash2,
  TriangleAlert,
  User,
  Calendar,
} from "lucide-react";
import DocumentModal from "./DocumentModal";

interface Props {
  initialDocuments: Document[];
  profiles: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
  today: string;
}

function expiryBadge(expiryDate: string | null, today: string) {
  if (!expiryDate) return null;
  const days = daysUntil(expiryDate, today);
  if (days < 0)
    return { label: `Scaduto da ${Math.abs(days)}g`, className: "bg-red-50 text-red-700" };
  if (days <= 30)
    return { label: `Scade tra ${days}g`, className: "bg-amber-50 text-amber-700" };
  return null;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsView({ initialDocuments, profiles, currentUserId, today }: Props) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPerson, setFilterPerson] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const categories = [...new Set(documents.map((d) => d.category))].sort();
  const totalSize = documents.reduce((sum, d) => sum + (d.file_size ?? 0), 0);

  const filtered = documents.filter((d) => {
    if (filterCategory !== "all" && d.category !== filterCategory) return false;
    if (filterPerson !== "all" && d.uploaded_by !== filterPerson) return false;
    return true;
  });

  const expiring = documents.filter((d) => {
    if (!d.expiry_date) return false;
    const days = daysUntil(d.expiry_date, today);
    return days <= 30;
  });

  function profileName(id: string | null) {
    if (!id) return "—";
    return profiles.find((p) => p.id === id)?.full_name ?? "—";
  }

  function handleSaved(doc: Document) {
    setDocuments((prev) => {
      const exists = prev.find((d) => d.id === doc.id);
      if (exists) return prev.map((d) => (d.id === doc.id ? doc : d));
      return [doc, ...prev];
    });
    setModalOpen(false);
    setEditingDoc(null);
    router.refresh();
  }

  async function handleDelete(id: string, filePath: string) {
    if (!confirm("Eliminare questo documento?")) return;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    await supabase.storage.from("documents").remove([filePath]);
    await supabase.from("documents").delete().eq("id", id);
    router.refresh();
  }

  async function getSignedUrl(doc: Document): Promise<string | null> {
    setLoading(doc.id);
    try {
      const res = await fetch(`/api/document-url?path=${encodeURIComponent(doc.file_path)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json.url as string;
    } catch {
      alert("Impossibile ottenere il file.");
      return null;
    } finally {
      setLoading(null);
    }
  }

  async function handleOpen(doc: Document) {
    const url = await getSignedUrl(doc);
    if (url) window.open(url, "_blank");
  }

  async function handleDownload(doc: Document) {
    const url = await getSignedUrl(doc);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const filters: FilterDef[] = [
    {
      key: "category",
      label: "Tutte le categorie",
      value: filterCategory,
      options: categories.map((c) => ({ value: c, label: c })),
      onChange: setFilterCategory,
    },
    {
      key: "person",
      label: "Tutte le persone",
      value: filterPerson,
      options: profiles.map((p) => ({ value: p.id, label: p.full_name })),
      onChange: setFilterPerson,
    },
  ];

  return (
    <>
      {/* Expiring alert */}
      {expiring.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <TriangleAlert className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-amber-800">Documenti in scadenza</h3>
            </div>
            <div className="space-y-1.5">
              {expiring.map((d) => {
                const badge = expiryBadge(d.expiry_date, today);
                const days = daysUntil(d.expiry_date!, today);
                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", badge?.className)}>
                      {badge?.label}
                    </span>
                    <span className={cn("font-medium", days < 0 ? "text-red-700" : "text-amber-900")}>
                      {d.name}
                    </span>
                    <span className="text-amber-600 text-xs">({d.category})</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + stats + Add */}
      <div className="space-y-1.5">
        <FilterBar
          filters={filters}
          action={
            <button
              onClick={() => { setEditingDoc(null); setModalOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nuovo
            </button>
          }
        />
        {totalSize > 0 && (
          <p className="text-xs text-gray-400">
            {documents.length} documenti · {formatSize(totalSize)} totali
          </p>
        )}
      </div>

      {/* Document grid */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-gray-100 text-gray-400 mb-3">
              <FileText className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-400">Nessun documento trovato.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const badge = expiryBadge(doc.expiry_date, today);
            return (
              <Card key={doc.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maple-50 text-maple-500">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-800 truncate">{doc.name}</h3>
                      <span className="inline-block mt-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                        {doc.category}
                      </span>
                    </div>
                    {badge && (
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", badge.className)}>
                        {badge.label}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                      <User className="h-3 w-3" />
                      {profileName(doc.uploaded_by)}
                    </span>
                    {doc.file_size ? <span>{formatSize(doc.file_size)}</span> : null}
                    {doc.expiry_date && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(doc.expiry_date)}
                      </span>
                    )}
                  </div>

                  {doc.notes && (
                    <p className="text-xs text-gray-400 line-clamp-2">{doc.notes}</p>
                  )}

                  <div className="flex gap-1.5 pt-0.5">
                    <button
                      onClick={() => handleOpen(doc)}
                      disabled={loading === doc.id}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-maple-50 px-2.5 py-1.5 text-xs font-medium text-maple-600 hover:bg-maple-100 disabled:opacity-50 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {loading === doc.id ? "..." : "Apri"}
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={loading === doc.id}
                      className="rounded-lg bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 transition-colors"
                      title="Scarica"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setEditingDoc(doc); setModalOpen(true); }}
                      className="rounded-lg bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                      title="Modifica"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id, doc.file_path)}
                      className="rounded-lg bg-red-50 p-1.5 text-red-500 hover:bg-red-100 transition-colors"
                      title="Elimina"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <DocumentModal
          document={editingDoc}
          currentUserId={currentUserId}
          onClose={() => { setModalOpen(false); setEditingDoc(null); }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
