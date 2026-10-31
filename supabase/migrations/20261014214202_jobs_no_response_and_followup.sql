-- nuovo stato "nessuna-risposta": ci finiscono da sole le candidature inviate senza risposta da 40 giorni
alter table public.job_applications drop constraint job_applications_status_check;
alter table public.job_applications add constraint job_applications_status_check
  check (status = any (array['da-candidarsi','inviata','colloquio','offerta','rifiutata','nessuna-risposta']));
-- promemoria "fai un ping" dopo 30 giorni: quando è stato mandato (una volta sola per candidatura)
alter table public.job_applications add column if not exists followup_reminded_at timestamptz;
