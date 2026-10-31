"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { SharedNote, UsefulLink, Profile } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import ModalShell from "@/components/ui/ModalShell";
import {
  Plus,
  StickyNote,
  Link as LinkIcon,
  Pencil,
  Trash2,
  ExternalLink,
  User,
} from "lucide-react";

interface Props {
  initialNotes: SharedNote[];
  initialLinks: UsefulLink[];
  profiles: Pick<Profile, "id" | "full_name">[];
}

export default function NotesView({ initialNotes, initialLinks, profiles }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [links, setLinks] = useState(initialLinks);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<SharedNote | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<UsefulLink | null>(null);
  const supabase = createClient();
  const router = useRouter();

  function profileName(id: string | null) {
    if (!id) return null;
    return profiles.find((p) => p.id === id)?.full_name ?? null;
  }

  function handleNoteSaved(note: SharedNote) {
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === note.id);
      if (exists) return prev.map((n) => (n.id === note.id ? note : n));
      return [note, ...prev];
    });
    setNoteModalOpen(false);
    setEditingNote(null);
    router.refresh();
  }

  async function handleNoteDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("shared_notes").delete().eq("id", id);
    router.refresh();
  }

  function handleLinkSaved(link: UsefulLink) {
    setLinks((prev) => {
      const exists = prev.find((l) => l.id === link.id);
      if (exists) return prev.map((l) => (l.id === link.id ? link : l));
      return [...prev, link];
    });
    setLinkModalOpen(false);
    setEditingLink(null);
    router.refresh();
  }

  async function handleLinkDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("useful_links").delete().eq("id", id);
    router.refresh();
  }

  const linksByCategory = links.reduce<Record<string, UsefulLink[]>>((acc, l) => {
    const key = l.category || "Altro";
    (acc[key] ??= []).push(l);
    return acc;
  }, {});

  return (
    <>
      {/* Notes section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <StickyNote className="h-3.5 w-3.5" />
            Note condivise
          </h2>
          <button
            onClick={() => { setEditingNote(null); setNoteModalOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-maple-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-maple-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuova nota
          </button>
        </div>

        {notes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-gray-400">Nessuna nota. Scrivi il primo appunto condiviso!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <Card key={note.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-800 line-clamp-2">{note.title}</h3>
                  {note.content && (
                    <p className="text-xs text-gray-500 line-clamp-4 whitespace-pre-wrap">{note.content}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      {profileName(note.created_by) && (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {profileName(note.created_by)}
                        </span>
                      )}
                      <span>{new Date(note.updated_at).toLocaleDateString("it-IT")}</span>
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => { setEditingNote(note); setNoteModalOpen(true); }}
                        className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        title="Modifica"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm("Eliminare questa nota?")) handleNoteDelete(note.id); }}
                        className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Elimina"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Links section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <LinkIcon className="h-3.5 w-3.5" />
            Link utili
          </h2>
          <button
            onClick={() => { setEditingLink(null); setLinkModalOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuovo link
          </button>
        </div>

        {links.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-gray-400">Nessun link salvato. Aggiungi le risorse che usate spesso!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(linksByCategory).map(([category, catLinks]) => (
              <div key={category}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
                  {category}
                </h3>
                <div className="space-y-1.5">
                  {catLinks.map((link) => (
                    <Card key={link.id}>
                      <CardContent className="p-0">
                        <div className="flex items-center gap-2 px-3 py-2">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-1 min-w-0 items-center gap-2 group"
                          >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400 group-hover:bg-maple-50 group-hover:text-maple-500 transition-colors">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </div>
                            <span className="min-w-0 flex-1 truncate">
                              <span className="text-sm font-medium text-gray-800 group-hover:text-maple-600 transition-colors">{link.title}</span>
                              {link.description && (
                                <span className="ml-2 hidden sm:inline text-xs text-gray-400">{link.description}</span>
                              )}
                            </span>
                          </a>
                          <button
                            onClick={() => { setEditingLink(link); setLinkModalOpen(true); }}
                            className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
                            title="Modifica"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm("Eliminare questo link?")) handleLinkDelete(link.id); }}
                            className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                            title="Elimina"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {noteModalOpen && (
        <NoteModal
          note={editingNote}
          onClose={() => { setNoteModalOpen(false); setEditingNote(null); }}
          onSaved={handleNoteSaved}
        />
      )}

      {linkModalOpen && (
        <LinkModal
          link={editingLink}
          maxPosition={links.length > 0 ? Math.max(...links.map((l) => l.position)) + 1 : 0}
          onClose={() => { setLinkModalOpen(false); setEditingLink(null); }}
          onSaved={handleLinkSaved}
        />
      )}
    </>
  );
}

/* ─── Note modal ─── */

const inputCls =
  "mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";

function NoteModal({
  note,
  onClose,
  onSaved,
}: {
  note: SharedNote | null;
  onClose: () => void;
  onSaved: (note: SharedNote) => void;
}) {
  const isEditing = !!note;
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      title: title.trim(),
      content: content.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (isEditing) {
      const { data, error } = await supabase
        .from("shared_notes")
        .update(payload)
        .eq("id", note.id)
        .select()
        .single();
      if (!error && data) onSaved(data as SharedNote);
    } else {
      const { data, error } = await supabase
        .from("shared_notes")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select()
        .single();
      if (!error && data) onSaved(data as SharedNote);
    }
    setLoading(false);
  }

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
        form="note-form"
        disabled={loading}
        className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
      >
        {loading ? "Salvataggio..." : isEditing ? "Salva" : "Crea"}
      </button>
    </div>
  );

  return (
    <ModalShell title={isEditing ? "Modifica nota" : "Nuova nota"} onClose={onClose} footer={footer}>
      <form id="note-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600">Titolo *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="es. Cose da fare la prima settimana"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Contenuto</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className={`${inputCls} resize-y`}
            placeholder="Scrivi qui..."
          />
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Link modal ─── */

function LinkModal({
  link,
  maxPosition,
  onClose,
  onSaved,
}: {
  link: UsefulLink | null;
  maxPosition: number;
  onClose: () => void;
  onSaved: (link: UsefulLink) => void;
}) {
  const isEditing = !!link;
  const [title, setTitle] = useState(link?.title ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [category, setCategory] = useState(link?.category ?? "");
  const [description, setDescription] = useState(link?.description ?? "");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload = {
      title: title.trim(),
      url: url.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
    };

    if (isEditing) {
      const { data, error } = await supabase
        .from("useful_links")
        .update(payload)
        .eq("id", link.id)
        .select()
        .single();
      if (!error && data) onSaved(data as UsefulLink);
    } else {
      const { data, error } = await supabase
        .from("useful_links")
        .insert({ ...payload, position: maxPosition })
        .select()
        .single();
      if (!error && data) onSaved(data as UsefulLink);
    }
    setLoading(false);
  }

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
        form="link-form"
        disabled={loading}
        className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
      >
        {loading ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
      </button>
    </div>
  );

  return (
    <ModalShell title={isEditing ? "Modifica link" : "Nuovo link"} onClose={onClose} footer={footer}>
      <form id="link-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600">Titolo *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="es. Sito ufficiale IRCC"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">URL *</label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputCls}
            placeholder="https://..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-600">Categoria</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
              placeholder="Burocrazia, Casa..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">Descrizione</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls}
              placeholder="Breve nota"
            />
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
