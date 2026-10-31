-- =============================================
-- MAPLE — dati iniziali generici (eseguiti dopo le migrazioni:
-- `supabase db reset` li carica da soli, altrimenti incollarli nel SQL editor)
-- =============================================

-- =============================================
-- SEED — Task checklist pre-popolati (generici)
-- =============================================

INSERT INTO checklist_items (title, description, phase, priority, position, is_default) VALUES
  ('Ottenere il codice fiscale / numero per lavorare', 'Necessario per essere assunti. Di solito si richiede online o presso un ufficio governativo.', 'prima-settimana', 'alta', 1, true),
  ('Aprire conto bancario', 'Portare passaporto e permesso di lavoro. Confrontare costi e servizi delle banche principali.', 'prima-settimana', 'alta', 2, true),
  ('Ottenere SIM / contratto telefonico', 'Confrontare i piani prepagati degli operatori locali.', 'prima-settimana', 'alta', 3, true),
  ('Registrarsi al servizio sanitario', 'Verificare eventuali periodi di attesa e i documenti di residenza richiesti.', 'primo-mese', 'alta', 4, true),
  ('Ottenere la tessera dei trasporti', 'Carta ricaricabile per metro, bus e tram. Acquistabile nelle stazioni o online.', 'prima-settimana', 'media', 5, true),
  ('Ottenere la tessera della biblioteca', 'Spesso gratuita con prova di residenza: libri, WiFi, corsi.', 'primo-mese', 'bassa', 6, true),
  ('Trovare alloggio definitivo', 'Cercare sui portali di annunci locali e nei gruppi online. Budget e quartiere da definire.', 'primo-mese', 'alta', 7, true),
  ('Trovare lavoro', 'Preparare il CV nel formato locale. LinkedIn, Indeed, Glassdoor. Networking e agenzie di recruiting.', 'primo-mese', 'alta', 8, true),
  ('Attivare assicurazione sanitaria di viaggio', 'Assicurazione privata per coprire l''eventuale attesa del servizio sanitario pubblico.', 'pre-partenza', 'alta', 9, true),
  ('Registrare indirizzo', 'Aggiornare l''indirizzo presso fisco e altri servizi una volta trovato alloggio definitivo.', 'primi-3-mesi', 'media', 10, true),
  ('Convertire patente', 'Verificare se la patente va convertita e quali documenti servono (es. traduzione giurata).', 'primi-3-mesi', 'media', 11, true);


-- =============================================
-- SEED — Risorse utili
-- =============================================

INSERT INTO useful_links (title, url, category, description, position) VALUES
  ('Ufficio immigrazione', 'https://example.com/immigration', 'Immigrazione', 'Sito ufficiale per permessi e visti', 1),
  ('Servizio sanitario', 'https://example.com/health', 'Sanità', 'Registrazione al servizio sanitario', 2),
  ('Trasporti pubblici', 'https://example.com/transit', 'Trasporti', 'Metro, bus, tram', 3),
  ('Biblioteca pubblica', 'https://example.com/library', 'Servizi', 'Biblioteca della città', 4);


-- =============================================
-- SEED — Budget settings iniziali
-- =============================================

INSERT INTO budget_settings (monthly_budget_cad, eur_cad_rate)
VALUES (3000.00, 1.50);

-- =============================================
-- SEED — Matchcode (liste modificabili da Impostazioni)
-- =============================================

-- Seed: piattaforme lavoro
INSERT INTO lookup_values (list_key, value, position) VALUES
  ('job_platform', 'LinkedIn', 0),
  ('job_platform', 'Indeed', 1),
  ('job_platform', 'Glassdoor', 2),
  ('job_platform', 'Sito aziendale', 3),
  ('job_platform', 'Referral', 4);

-- Seed: tipi colloquio
INSERT INTO lookup_values (list_key, value, position) VALUES
  ('job_interview_type', 'Primo incontro', 0),
  ('job_interview_type', 'Colloquio tecnico', 1),
  ('job_interview_type', 'Colloquio HR', 2),
  ('job_interview_type', 'Finale', 3);

-- Seed: ruoli contatto (condiviso tra lavoro e alloggio)
INSERT INTO lookup_values (list_key, value, position) VALUES
  ('contact_role', 'Hiring Manager', 0),
  ('contact_role', 'Recruiter', 1),
  ('contact_role', 'Referral', 2),
  ('contact_role', 'HR', 3),
  ('contact_role', 'Agente', 4),
  ('contact_role', 'Proprietario', 5),
  ('contact_role', 'Inquilino uscente', 6);

-- Seed: tipi data alloggio
INSERT INTO lookup_values (list_key, value, position) VALUES
  ('housing_date_type', 'Prima visita', 0),
  ('housing_date_type', 'Seconda visita', 1),
  ('housing_date_type', 'Offerta', 2),
  ('housing_date_type', 'Risposta attesa', 3),
  ('housing_date_type', 'Firma contratto', 4),
  ('housing_date_type', 'Consegna chiavi', 5);

-- Seed: categorie documenti
INSERT INTO lookup_values (list_key, value, position) VALUES
  ('document_category', 'Identità', 0),
  ('document_category', 'Visto', 1),
  ('document_category', 'Contratti', 2),
  ('document_category', 'Assicurazione', 3),
  ('document_category', 'Altro', 4);

-- Seed: categorie prodotti (confronto prezzi)
INSERT INTO lookup_values (list_key, value, position) VALUES
  ('product_category', 'Frutta e verdura', 0),
  ('product_category', 'Latticini e uova', 1),
  ('product_category', 'Carne e pesce', 2),
  ('product_category', 'Pane e cereali', 3),
  ('product_category', 'Pasta e dispensa', 4),
  ('product_category', 'Surgelati', 5),
  ('product_category', 'Bevande', 6),
  ('product_category', 'Snack e dolci', 7),
  ('product_category', 'Igiene e cura persona', 8),
  ('product_category', 'Pulizia casa', 9),
  ('product_category', 'Altro', 10);
