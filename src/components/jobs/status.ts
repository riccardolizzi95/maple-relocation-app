import type { JobStatus } from "@/lib/types";

/**
 * Stati delle candidature: etichette di Maple, colori come i chip dei menu a tendina
 * di Google Sheets che l'utente usava (14/10): Waiting azzurro, Interview giallo,
 * Job Offer verde, Rejected rosso, Ghosted grigio = "Nessuna risposta" (ci finiscono
 * da sole le inviate dopo 40 giorni, vedi lib/job-followups). "Da candidarsi" è
 * bianco con bordo: non ancora iniziata.
 */
export const JOB_STATUSES: { value: JobStatus; label: string; chip: string; dot: string }[] = [
  { value: "da-candidarsi", label: "Da candidarsi", chip: "bg-white text-[#3d3d3d] ring-1 ring-inset ring-gray-300", dot: "bg-white ring-1 ring-gray-400" },
  { value: "inviata", label: "Inviata", chip: "bg-[#c6dbe1] text-[#215a6c]", dot: "bg-[#5b9bb0]" },
  { value: "colloquio", label: "Colloquio", chip: "bg-[#ffe5a0] text-[#473821]", dot: "bg-[#e0b030]" },
  { value: "offerta", label: "Offerta", chip: "bg-[#d4edbc] text-[#11734b]", dot: "bg-[#11734b]" },
  { value: "rifiutata", label: "Rifiutata", chip: "bg-[#ffcfc9] text-[#b10202]", dot: "bg-[#e05545]" },
  { value: "nessuna-risposta", label: "Nessuna risposta", chip: "bg-[#e6e6e6] text-[#3d3d3d]", dot: "bg-[#9e9e9e]" },
];

export const jobStatus = (value: JobStatus) => JOB_STATUSES.find((s) => s.value === value) ?? JOB_STATUSES[0];
