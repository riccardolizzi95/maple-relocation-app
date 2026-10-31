-- add_owner_to_job_applications
ALTER TABLE job_applications
ADD COLUMN owner_id UUID REFERENCES profiles(id);

-- add_exchange_rate_to_expenses
ALTER TABLE expenses ADD COLUMN exchange_rate NUMERIC(8,4);

-- create_monthly_budgets
CREATE TABLE monthly_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL UNIQUE CHECK (month ~ '^\d{4}-\d{2}$'),
  amount_cad NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON monthly_budgets
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 006_jobs_ats_expansion
ALTER TABLE job_applications
  ADD COLUMN location TEXT,
  ADD COLUMN platform TEXT,
  ADD COLUMN listing_text TEXT,
  ADD COLUMN listing_file_path TEXT,
  ADD COLUMN salary_range TEXT,
  ADD COLUMN benefits TEXT,
  ADD COLUMN attachments_sent TEXT[];

CREATE TABLE job_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE job_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything on job_contacts"
  ON job_contacts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE job_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  interview_type TEXT NOT NULL,
  date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE job_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything on job_interviews"
  ON job_interviews FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_job_contacts_job_id ON job_contacts(job_id);
CREATE INDEX idx_job_interviews_job_id ON job_interviews(job_id);

-- 007_lookup_values (i valori iniziali sono in supabase/seed.sql)
CREATE TABLE lookup_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_key TEXT NOT NULL,
  value TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (list_key, value)
);
ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything on lookup_values"
  ON lookup_values FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_lookup_values_list_key ON lookup_values(list_key, position);

-- 008_housing_ats_expansion
ALTER TABLE housing
  ADD COLUMN offer_amount_cad NUMERIC(10,2),
  ADD COLUMN offer_deadline DATE,
  ADD COLUMN offer_notes TEXT,
  ADD COLUMN utilities_included TEXT CHECK (utilities_included IN ('si', 'no', 'parziale')),
  ADD COLUMN utilities_estimate_cad NUMERIC(10,2),
  ADD COLUMN condo_fees_included BOOLEAN,
  ADD COLUMN condo_fees_cad NUMERIC(10,2),
  ADD COLUMN furnished TEXT CHECK (furnished IN ('si', 'no', 'parziale')),
  ADD COLUMN furnished_notes TEXT,
  ADD COLUMN deposit_cad NUMERIC(10,2),
  ADD COLUMN advance_months INT,
  ADD COLUMN min_lease_months INT,
  ADD COLUMN cancellation_terms TEXT,
  ADD COLUMN contract_notes TEXT;

CREATE TABLE housing_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  housing_id UUID NOT NULL REFERENCES housing(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE housing_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything on housing_contacts"
  ON housing_contacts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_housing_contacts_housing_id ON housing_contacts(housing_id);

CREATE TABLE housing_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  housing_id UUID NOT NULL REFERENCES housing(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE housing_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything on housing_dates"
  ON housing_dates FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_housing_dates_housing_id ON housing_dates(housing_id);

-- 009_documents_flexible_category
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_category_check;

-- add_housing_name
ALTER TABLE public.housing ADD COLUMN IF NOT EXISTS name text;

-- add_profile_role
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin'));
