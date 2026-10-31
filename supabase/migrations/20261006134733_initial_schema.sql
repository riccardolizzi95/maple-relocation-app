-- PROFILES
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: crea profilo automaticamente alla registrazione
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CHECKLIST
CREATE TABLE checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('pre-partenza', 'prima-settimana', 'primo-mese', 'primi-3-mesi')),
  status TEXT NOT NULL DEFAULT 'da-fare' CHECK (status IN ('da-fare', 'in-corso', 'fatto')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'bassa')),
  due_date DATE,
  assigned_to UUID REFERENCES profiles(id),
  notes TEXT,
  position INT NOT NULL DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- HOUSING
CREATE TABLE housing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  neighborhood TEXT,
  price_cad NUMERIC(10,2),
  listing_url TEXT,
  status TEXT NOT NULL DEFAULT 'da-vedere' CHECK (status IN ('da-vedere', 'contattato', 'visto', 'scartato', 'candidato')),
  pros TEXT,
  cons TEXT,
  notes TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- JOB APPLICATIONS
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  url TEXT,
  applied_date DATE,
  status TEXT NOT NULL DEFAULT 'da-candidarsi' CHECK (status IN ('da-candidarsi', 'inviata', 'colloquio', 'offerta', 'rifiutata')),
  notes TEXT,
  contact TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- EXPENSES
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cad NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('alloggio', 'cibo', 'trasporti', 'burocrazia', 'telefono', 'svago', 'altro')),
  description TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- BUDGET SETTINGS
CREATE TABLE budget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_budget_cad NUMERIC(10,2),
  eur_cad_rate NUMERIC(8,4) DEFAULT 1.50,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- DOCUMENTS
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('identita', 'visto', 'contratti', 'assicurazione', 'altro')),
  file_path TEXT NOT NULL,
  file_size INT,
  expiry_date DATE,
  notes TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI CONVERSATIONS
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  saved_as_note BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SHARED NOTES
CREATE TABLE shared_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- USEFUL LINKS
CREATE TABLE useful_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  description TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- APP SETTINGS
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_date DATE,
  airbnb_end_date DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS — Workspace condiviso (auth.uid() IS NOT NULL)
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON profiles
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON checklist_items
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE housing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON housing
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON job_applications
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON expenses
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE budget_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON budget_settings
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON documents
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON ai_conversations
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE shared_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON shared_notes
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE useful_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON useful_links
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON app_settings
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
