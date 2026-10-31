CREATE TABLE user_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, key)
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Ogni utente legge/scrive SOLO le proprie preferenze
CREATE POLICY "Users read own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own preferences"
  ON user_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_preferences_user_key ON user_preferences(user_id, key);
