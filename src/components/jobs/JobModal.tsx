"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { JobApplication, JobStatus, JobContact, JobInterview, AttachmentSent, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toDateTimeLocal, todayKey } from "@/lib/dates";
import { openReceipt as openStoredFile, removeReceipt as removeStoredFile } from "@/lib/receipts";
import EditableSelect from "@/components/ui/EditableSelect";
import ModalShell from "@/components/ui/ModalShell";
import { JOB_STATUSES } from "./status";
import { ClipboardList, FileText, Users, Mic, Paperclip, ExternalLink } from "lucide-react";

// stesse etichette (e stesso ordine) dei chip colorati della lista
const STATUS_OPTIONS = JOB_STATUSES.map(({ value, label }) => ({ value, label }));

const ATTACHMENT_OPTIONS: { value: AttachmentSent; label: string }[] = [
  { value: "cv", label: "CV" },
  { value: "cover-letter", label: "Cover Letter" },
  { value: "portfolio", label: "Portfolio" },
  { value: "video", label: "Video" },
  { value: "altro", label: "Altro" },
];

type Section = "info" | "annuncio" | "contatti" | "colloqui" | "extra";

const SECTIONS: { key: Section; label: string; Icon: typeof ClipboardList }[] = [
  { key: "info", label: "Info", Icon: ClipboardList },
  { key: "annuncio", label: "Annuncio", Icon: FileText },
  { key: "contatti", label: "Contatti", Icon: Users },
  { key: "colloqui", label: "Colloqui", Icon: Mic },
  { key: "extra", label: "Extra", Icon: Paperclip },
];

interface Props {
  item: JobApplication | null;
  profiles: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
  onClose: () => void;
  onSaved: (item: JobApplication) => void;
}

type DraftContact = Omit<JobContact, "id" | "job_id" | "created_at"> & { id?: string; _tempId?: string };
type DraftInterview = Omit<JobInterview, "id" | "job_id" | "created_at"> & { id?: string; _tempId?: string };

/** Valori iniziali del modulo: servono anche a capire se ci sono modifiche non salvate. */
function fieldsFrom(item: JobApplication | null, currentUserId: string) {
  return {
    company: item?.company ?? "",
    role: item?.role ?? "",
    url: item?.url ?? "",
    appliedDate: item?.applied_date ?? "",
    status: (item?.status ?? "da-candidarsi") as JobStatus,
    ownerId: item?.owner_id ?? currentUserId,
    location: item?.location ?? "",
    platform: item?.platform ?? "",
    notes: item?.notes ?? "",
    listingText: item?.listing_text ?? "",
    listingFilePath: item?.listing_file_path ?? "",
    salaryRange: item?.salary_range ?? "",
    benefits: item?.benefits ?? "",
    attachmentsSent: (item?.attachments_sent ?? []) as AttachmentSent[],
  };
}

const hasText = (v: string | null | undefined) => !!v && v.trim() !== "";
const contactHasContent = (c: DraftContact) => [c.name, c.role, c.email, c.phone, c.notes].some(hasText);
const interviewHasContent = (i: DraftInterview) => [i.interview_type, i.date, i.notes].some(hasText);
const rowsKey = (rows: (DraftContact | DraftInterview)[]) => JSON.stringify(rows.map((r) => ({ ...r, _tempId: undefined })));

export default function JobModal({ item, profiles, currentUserId, onClose, onSaved }: Props) {
  const isEditing = !!item;
  const supabase = createClient();

  const [section, setSection] = useState<Section>("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [initial] = useState(() => fieldsFrom(item, currentUserId));
  // id della candidatura nel DB: per una nuova esiste dopo il primo salvataggio, così
  // se contatti o colloqui falliscono e si riprova non nasce un doppione
  const [jobId, setJobId] = useState<string | null>(item?.id ?? null);

  // Info base
  const [company, setCompany] = useState(initial.company);
  const [role, setRole] = useState(initial.role);
  const [url, setUrl] = useState(initial.url);
  const [appliedDate, setAppliedDate] = useState(initial.appliedDate);
  const [status, setStatus] = useState<JobStatus>(initial.status);
  const [ownerId, setOwnerId] = useState(initial.ownerId);
  const [location, setLocation] = useState(initial.location);
  const [platform, setPlatform] = useState(initial.platform);
  const [notes, setNotes] = useState(initial.notes);

  // Annuncio
  const [listingText, setListingText] = useState(initial.listingText);
  const [listingFilePath, setListingFilePath] = useState(initial.listingFilePath);
  const [listingUploading, setListingUploading] = useState(false);

  // Extra
  const [salaryRange, setSalaryRange] = useState(initial.salaryRange);
  const [benefits, setBenefits] = useState(initial.benefits);
  const [attachmentsSent, setAttachmentsSent] = useState<AttachmentSent[]>(initial.attachmentsSent);

  // Contatti e colloqui: caricati a parte. Finché non sono arrivati (o se il caricamento
  // fallisce) il salvataggio NON li tocca, così non si cancella mai niente per sbaglio.
  const [contacts, setContacts] = useState<DraftContact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(!isEditing);
  const [contactsFailed, setContactsFailed] = useState(false);
  const [interviews, setInterviews] = useState<DraftInterview[]>([]);
  const [interviewsLoaded, setInterviewsLoaded] = useState(!isEditing);
  const [interviewsFailed, setInterviewsFailed] = useState(false);
  // id già salvati nel DB e stato iniziale delle liste (per le modifiche non salvate)
  const saved = useRef({ contactIds: [] as string[], interviewIds: [] as string[], contacts: "[]", interviews: "[]" });

  useEffect(() => {
    if (!isEditing) return;
    supabase.from("job_contacts").select("*").eq("job_id", item.id).order("created_at").then(({ data, error }) => {
      if (error) { setContactsFailed(true); return; }
      const rows = (data ?? []).map((c) => ({ ...c }) as DraftContact);
      saved.current.contactIds = rows.map((c) => c.id!);
      saved.current.contacts = rowsKey(rows);
      setContacts(rows);
      setContactsLoaded(true);
    });
    supabase.from("job_interviews").select("*").eq("job_id", item.id).order("date", { ascending: true }).then(({ data, error }) => {
      if (error) { setInterviewsFailed(true); return; }
      const rows = (data ?? []).map((i) => ({ ...i }) as DraftInterview);
      saved.current.interviewIds = rows.map((i) => i.id!);
      saved.current.interviews = rowsKey(rows);
      setInterviews(rows);
      setInterviewsLoaded(true);
    });
  }, [isEditing, item?.id, supabase]);

  function currentFields() {
    return {
      company, role, url, appliedDate, status, ownerId, location, platform, notes,
      listingText, listingFilePath, salaryRange, benefits, attachmentsSent,
    };
  }

  /** Chiusura con modifiche non salvate: chiede conferma invece di buttarle via. */
  function requestClose() {
    const dirty =
      JSON.stringify(currentFields()) !== JSON.stringify(initial) ||
      (contactsLoaded && rowsKey(contacts) !== saved.current.contacts) ||
      (interviewsLoaded && rowsKey(interviews) !== saved.current.interviews);
    if (dirty && !confirm("Ci sono modifiche non salvate. Chiudere e perderle?")) return;
    onClose();
  }

  function changeStatus(next: JobStatus) {
    setStatus(next);
    // candidatura appena inviata: la data è oggi, se non è già scritta
    if (next === "inviata" && !appliedDate) setAppliedDate(todayKey());
  }

  function addContact() {
    setContacts((prev) => [...prev, { role: "", name: "", email: null, phone: null, notes: null, _tempId: crypto.randomUUID() }]);
  }

  function removeContact(idx: number) {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateContact(idx: number, field: keyof DraftContact, value: string) {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value || null } : c));
  }

  function addInterview() {
    setInterviews((prev) => [...prev, { interview_type: "", date: null, notes: null, _tempId: crypto.randomUUID() }]);
  }

  function removeInterview(idx: number) {
    setInterviews((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateInterview(idx: number, field: keyof DraftInterview, value: string) {
    setInterviews((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value || null } : c));
  }

  function toggleAttachment(val: AttachmentSent) {
    setAttachmentsSent((prev) => prev.includes(val) ? prev.filter((a) => a !== val) : [...prev, val]);
  }

  async function handleListingUpload(file: File) {
    setListingUploading(true);
    setError(null);
    const ext = file.name.split(".").pop();
    const path = `listings/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
    if (upErr) setError(`File dell'annuncio non caricato: ${upErr.message}`);
    else setListingFilePath(path);
    setListingUploading(false);
  }

  async function handleOpenListingFile() {
    if (!(await openStoredFile(listingFilePath))) setError("Impossibile aprire il file dell'annuncio, riprova.");
  }

  /**
   * Salva le righe figlie una per una: aggiorna le esistenti, aggiunge le nuove e solo
   * se tutto è andato bene toglie quelle rimosse. Le righe nuove ricevono subito il
   * loro id, così ripetere il salvataggio dopo un errore non crea doppioni.
   */
  async function syncRows<T extends { id?: string }>(
    table: "job_contacts" | "job_interviews",
    rows: T[],
    savedIds: string[],
    fields: (row: T) => Record<string, unknown>,
    jobId: string
  ) {
    const fresh = rows.filter((r) => !r.id);
    const [updates, inserted] = await Promise.all([
      Promise.all(rows.filter((r) => r.id).map((r) => supabase.from(table).update(fields(r)).eq("id", r.id!))),
      fresh.length ? supabase.from(table).insert(fresh.map((r) => ({ job_id: jobId, ...fields(r) }))).select("id") : null,
    ]);
    let next = rows;
    if (inserted?.data) {
      const ids = inserted.data.map((d) => d.id as string);
      let k = 0;
      next = rows.map((r) => (r.id ? r : { ...r, id: ids[k++] }));
    }
    let failed = updates.some((u) => u.error) || !!inserted?.error;
    const kept = next.filter((r) => r.id).map((r) => r.id!);
    const removed = savedIds.filter((id) => !kept.includes(id));
    let stillThere: string[] = [];
    if (!failed && removed.length) {
      const { error } = await supabase.from(table).delete().in("id", removed);
      if (error) { failed = true; stillThere = removed; }
    } else stillThere = removed;
    return { failed, next, ids: [...kept, ...stillThere] };
  }

  async function syncChildren(jobId: string): Promise<string[]> {
    const problems: string[] = [];
    if (contactsLoaded) {
      const r = await syncRows("job_contacts", contacts.filter(contactHasContent), saved.current.contactIds, (c) => ({
        role: c.role?.trim() || "Contatto",
        name: c.name.trim(),
        email: c.email?.trim() || null,
        phone: c.phone?.trim() || null,
        notes: c.notes?.trim() || null,
      }), jobId);
      saved.current.contactIds = r.ids;
      if (!r.failed) saved.current.contacts = rowsKey(r.next);
      setContacts(r.next);
      if (r.failed) problems.push("tutti i contatti");
    }
    if (interviewsLoaded) {
      const r = await syncRows("job_interviews", interviews.filter(interviewHasContent), saved.current.interviewIds, (i) => ({
        interview_type: i.interview_type.trim(),
        date: i.date,
        notes: i.notes?.trim() || null,
      }), jobId);
      saved.current.interviewIds = r.ids;
      if (!r.failed) saved.current.interviews = rowsKey(r.next);
      setInterviews(r.next);
      if (r.failed) problems.push("tutti i colloqui");
    }
    return problems;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // niente righe scartate in silenzio: se manca il dato obbligatorio lo si dice
    const nameless = contacts.findIndex((c) => contactHasContent(c) && !hasText(c.name));
    if (nameless >= 0) {
      setSection("contatti");
      setError(`Il contatto ${nameless + 1} non ha il nome: scrivilo oppure rimuovi il contatto.`);
      return;
    }
    const typeless = interviews.findIndex((i) => interviewHasContent(i) && !hasText(i.interview_type));
    if (typeless >= 0) {
      setSection("colloqui");
      setError(`Scegli il tipo del colloquio ${typeless + 1}.`);
      return;
    }

    setLoading(true);
    // la vecchia colonna "contact" non si tocca: eventuali dati storici restano
    const payload = {
      company: company.trim(),
      role: role.trim(),
      url: url.trim() || null,
      applied_date: appliedDate || null,
      status,
      notes: notes.trim() || null,
      owner_id: ownerId || null,
      location: location.trim() || null,
      platform: platform || null,
      listing_text: listingText.trim() || null,
      listing_file_path: listingFilePath || null,
      salary_range: salaryRange.trim() || null,
      benefits: benefits.trim() || null,
      attachments_sent: attachmentsSent.length > 0 ? attachmentsSent : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error: saveErr } = jobId
      ? await supabase.from("job_applications").update(payload).eq("id", jobId).select().single()
      : await supabase.from("job_applications").insert(payload).select().single();
    if (saveErr || !data) {
      setLoading(false);
      setError(`Salvataggio non riuscito: ${saveErr?.message ?? "riprova"}. Le modifiche sono ancora qui.`);
      return;
    }
    const savedJob = data as JobApplication;
    setJobId(savedJob.id);

    const problems = await syncChildren(savedJob.id);
    // file dell'annuncio sostituito o tolto: il vecchio si elimina solo a salvataggio riuscito
    if (initial.listingFilePath && initial.listingFilePath !== listingFilePath) {
      removeStoredFile(supabase, initial.listingFilePath);
    }
    setLoading(false);
    if (problems.length) {
      setError(`Candidatura salvata, ma non ${problems.join(" e ")}. Riprova a salvare.`);
      return;
    }
    onSaved(savedJob);
  }

  const fieldCls = "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm placeholder:text-gray-300 focus:border-maple-400 focus:ring-2 focus:ring-maple-100 focus:outline-none transition-colors";
  const inputCls = `mt-1.5 ${fieldCls}`;

  const tabs = (
    <div className="no-scrollbar flex px-4 overflow-x-auto">
      {SECTIONS.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => setSection(s.key)}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
            section === s.key ? "border-maple-500 text-maple-600" : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          <s.Icon className="h-3.5 w-3.5" />
          {s.label}
        </button>
      ))}
    </div>
  );

  const footer = (
    <div className="space-y-2">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={requestClose}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
        >
          Annulla
        </button>
        <button
          type="submit"
          form="job-form"
          disabled={loading || listingUploading}
          className="rounded-lg bg-maple-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maple-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      title={isEditing ? "Modifica candidatura" : "Nuova candidatura"}
      onClose={requestClose}
      tabs={tabs}
      footer={footer}
    >
      <form id="job-form" onSubmit={handleSubmit} className="space-y-4">

            {/* INFO BASE */}
            {section === "info" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Azienda *</label>
                    <input type="text" required value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} placeholder="Shopify" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Ruolo *</label>
                    <input type="text" required value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} placeholder="Frontend Developer" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Link annuncio</label>
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://..." />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Stato</label>
                    <select value={status} onChange={(e) => changeStatus(e.target.value as JobStatus)} className={inputCls}>
                      {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Data candidatura</label>
                    <input type="date" value={appliedDate} onChange={(e) => setAppliedDate(e.target.value)} className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Candidatura di</label>
                    <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                      {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Piattaforma</label>
                    <EditableSelect listKey="job_platform" value={platform} onChange={setPlatform} placeholder="—" className="mt-1.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Città / Zona</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="Città, zona, da remoto..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Note</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={cn(inputCls, "resize-y")} placeholder="Appunti generali..." />
                </div>
              </>
            )}

            {/* ANNUNCIO */}
            {section === "annuncio" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Testo annuncio (copia-incolla)</label>
                  <textarea
                    value={listingText}
                    onChange={(e) => setListingText(e.target.value)}
                    rows={8}
                    className={cn(inputCls, "resize-y font-mono text-xs")}
                    placeholder="Incolla qui il testo dell'annuncio..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Oppure carica il file dell&apos;annuncio</label>
                  {listingFilePath ? (
                    <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm">
                      <span className="text-green-600">✓ File caricato</span>
                      <button
                        type="button"
                        onClick={handleOpenListingFile}
                        className="inline-flex items-center gap-1 text-xs font-medium text-maple-600 hover:text-maple-700"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Apri
                      </button>
                      <button
                        type="button"
                        onClick={() => setListingFilePath("")}
                        className="ml-auto text-xs text-red-500 hover:text-red-600"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      disabled={listingUploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleListingUpload(f); }}
                      className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-maple-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-maple-600 hover:file:bg-maple-100"
                    />
                  )}
                  {listingUploading && <p className="mt-1 text-xs text-amber-500">Caricamento in corso...</p>}
                </div>
              </>
            )}

            {/* CONTATTI */}
            {section === "contatti" && (
              <>
                {contactsFailed ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Contatti non caricati (connessione?). Chiudi e riapri la candidatura: salvando ora restano come sono.
                  </p>
                ) : !contactsLoaded ? (
                  <p className="text-sm text-gray-400">Caricamento contatti...</p>
                ) : (
                  <>
                    {contacts.length === 0 && (
                      <p className="text-sm text-gray-400">Nessun contatto aggiunto.</p>
                    )}
                    {contacts.map((c, idx) => (
                      <div key={c.id ?? c._tempId} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">Contatto {idx + 1}</span>
                          <button type="button" onClick={() => removeContact(idx)} className="text-xs text-red-500 hover:text-red-600">Rimuovi</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={c.name ?? ""}
                            onChange={(e) => updateContact(idx, "name", e.target.value)}
                            className={fieldCls}
                            placeholder="Nome *"
                          />
                          <EditableSelect listKey="contact_role" value={c.role ?? ""} onChange={(v) => updateContact(idx, "role", v)} placeholder="Ruolo..." />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="email" value={c.email ?? ""} onChange={(e) => updateContact(idx, "email", e.target.value)} className={fieldCls} placeholder="Email" />
                          <input type="tel" value={c.phone ?? ""} onChange={(e) => updateContact(idx, "phone", e.target.value)} className={fieldCls} placeholder="Telefono" />
                        </div>
                        <input type="text" value={c.notes ?? ""} onChange={(e) => updateContact(idx, "notes", e.target.value)} className={fieldCls} placeholder="Note contatto" />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addContact}
                      className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-maple-400 hover:text-maple-600 transition-colors"
                    >
                      + Aggiungi contatto
                    </button>
                  </>
                )}
              </>
            )}

            {/* COLLOQUI */}
            {section === "colloqui" && (
              <>
                {interviewsFailed ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Colloqui non caricati (connessione?). Chiudi e riapri la candidatura: salvando ora restano come sono.
                  </p>
                ) : !interviewsLoaded ? (
                  <p className="text-sm text-gray-400">Caricamento colloqui...</p>
                ) : (
                  <>
                    {interviews.length === 0 && (
                      <p className="text-sm text-gray-400">Nessun colloquio aggiunto.</p>
                    )}
                    {interviews.map((iv, idx) => (
                      <div key={iv.id ?? iv._tempId} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">Colloquio {idx + 1}</span>
                          <button type="button" onClick={() => removeInterview(idx)} className="text-xs text-red-500 hover:text-red-600">Rimuovi</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <EditableSelect listKey="job_interview_type" value={iv.interview_type} onChange={(v) => updateInterview(idx, "interview_type", v)} placeholder="Tipo..." allowEmpty={false} />
                          <input
                            type="datetime-local"
                            value={iv.date ? toDateTimeLocal(iv.date) : ""}
                            onChange={(e) => updateInterview(idx, "date", e.target.value ? new Date(e.target.value).toISOString() : "")}
                            className={fieldCls}
                          />
                        </div>
                        <textarea
                          value={iv.notes ?? ""}
                          onChange={(e) => updateInterview(idx, "notes", e.target.value)}
                          rows={2}
                          className={cn(fieldCls, "resize-y")}
                          placeholder="Esito / appunti colloquio"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addInterview}
                      className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-maple-400 hover:text-maple-600 transition-colors"
                    >
                      + Aggiungi colloquio
                    </button>
                  </>
                )}
              </>
            )}

            {/* EXTRA */}
            {section === "extra" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Range retributivo</label>
                  <input type="text" value={salaryRange} onChange={(e) => setSalaryRange(e.target.value)} className={inputCls} placeholder="70-85k CAD" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Benefits</label>
                  <textarea value={benefits} onChange={(e) => setBenefits(e.target.value)} rows={3} className={cn(inputCls, "resize-y")} placeholder="Dental, remote, stock options..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allegati inviati</label>
                  <div className="flex flex-wrap gap-2">
                    {ATTACHMENT_OPTIONS.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => toggleAttachment(a.value)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          attachmentsSent.includes(a.value)
                            ? "border-maple-500 bg-maple-50 text-maple-600"
                            : "border-gray-300 bg-white text-gray-500 hover:border-gray-400"
                        )}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
      </form>
    </ModalShell>
  );
}
