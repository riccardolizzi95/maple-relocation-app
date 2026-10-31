-- Crea bucket privato
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- Policy: utenti autenticati possono fare upload
CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

-- Policy: utenti autenticati possono leggere
CREATE POLICY "Authenticated read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

-- Policy: utenti autenticati possono aggiornare
CREATE POLICY "Authenticated update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

-- Policy: utenti autenticati possono eliminare
CREATE POLICY "Authenticated delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );
