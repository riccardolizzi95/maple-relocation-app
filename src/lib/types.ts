export type Phase = 'pre-partenza' | 'prima-settimana' | 'primo-mese' | 'primi-3-mesi'
export type TaskStatus = 'da-fare' | 'in-corso' | 'fatto'
export type Priority = 'alta' | 'media' | 'bassa'
export type HousingStatus = 'da-vedere' | 'contattato' | 'visto' | 'scartato' | 'candidato'
export type JobStatus = 'da-candidarsi' | 'inviata' | 'colloquio' | 'offerta' | 'rifiutata' | 'nessuna-risposta'
export type ExpenseCategory =
  | 'alloggio' | 'cibo' | 'ristoranti' | 'casa' | 'trasporti' | 'telefono'
  | 'salute' | 'abbigliamento' | 'svago' | 'burocrazia' | 'altro'

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  role: 'member' | 'admin'
  created_at: string
}

export interface ChecklistItem {
  id: string
  title: string
  description: string | null
  phase: Phase
  status: TaskStatus
  priority: Priority
  due_date: string | null
  assigned_to: string | null
  notes: string | null
  position: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export type TriState = 'si' | 'no' | 'parziale'

export interface Housing {
  id: string
  name: string | null
  address: string
  neighborhood: string | null
  price_cad: number | null
  listing_url: string | null
  status: HousingStatus
  pros: string | null
  cons: string | null
  notes: string | null
  rating: number | null
  offer_amount_cad: number | null
  offer_deadline: string | null
  offer_notes: string | null
  utilities_included: TriState | null
  utilities_estimate_cad: number | null
  condo_fees_included: boolean | null
  condo_fees_cad: number | null
  furnished: TriState | null
  furnished_notes: string | null
  deposit_cad: number | null
  advance_months: number | null
  min_lease_months: number | null
  cancellation_terms: string | null
  contract_notes: string | null
  created_at: string
  updated_at: string
}

export interface HousingContact {
  id: string
  housing_id: string
  role: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
}

export interface HousingDate {
  id: string
  housing_id: string
  date: string
  type: string
  notes: string | null
  created_at: string
}

export type AttachmentSent = 'cv' | 'cover-letter' | 'portfolio' | 'video' | 'altro'

export interface JobApplication {
  id: string
  company: string
  role: string
  url: string | null
  applied_date: string | null
  status: JobStatus
  notes: string | null
  contact: string | null
  owner_id: string | null
  location: string | null
  platform: string | null
  listing_text: string | null
  listing_file_path: string | null
  salary_range: string | null
  benefits: string | null
  attachments_sent: AttachmentSent[] | null
  /** quando è partito il promemoria "fai un ping" (30 giorni senza risposta) */
  followup_reminded_at: string | null
  created_at: string
  updated_at: string
}

export interface JobContact {
  id: string
  job_id: string
  role: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
}

export interface JobInterview {
  id: string
  job_id: string
  interview_type: string
  date: string | null
  notes: string | null
  created_at: string
}

export interface Expense {
  id: string
  amount_cad: number
  category: ExpenseCategory
  description: string
  date: string
  exchange_rate: number | null
  recurring: boolean
  recurring_of: string | null
  /** foto dello scontrino nel bucket privato "documents" (receipts/...) */
  receipt_path: string | null
  /** valuta in cui è stato digitato l'importo (null = storiche, trattate come CAD) */
  input_currency: 'CAD' | 'EUR' | null
  /** negozio, per il confronto prezzi dei prodotti (null se non indicato) */
  store: string | null
  created_by: string | null
  created_at: string
}

export type ItemUnit = 'pz' | 'kg' | 'g' | 'l' | 'ml'

/** Anagrafica prodotti: un prodotto esiste una volta sola (nome unico), con categoria */
export interface Product {
  id: string
  name: string
  category: string
  default_unit: ItemUnit
  created_at: string
}

/** Prodotto di una spesa (facoltativo): price_cad è il totale della riga */
export interface ExpenseItem {
  id: string
  expense_id: string
  product_id: string | null
  name: string
  quantity: number
  unit: ItemUnit
  price_cad: number
  created_at: string
}

/** Limite mensile per categoria, condiviso e valido per ogni mese */
export interface CategoryBudget {
  category: ExpenseCategory
  amount_cad: number
  updated_at: string
}

export interface BudgetSettings {
  id: string
  monthly_budget_cad: number | null
  eur_cad_rate: number
  /** saldo dei risparmi alla data savings_date (fine giornata), nella valuta savings_currency */
  savings_amount: number | null
  savings_currency: 'EUR' | 'CAD'
  savings_date: string | null
  updated_at: string
}

/** Entrata (stipendio, rimborso...): amount_cad come le spese, exchange_rate del giorno */
export interface Income {
  id: string
  date: string
  description: string
  amount_cad: number
  exchange_rate: number | null
  input_currency: 'CAD' | 'EUR' | null
  created_by: string | null
  created_at: string
}

export interface MonthlyBudget {
  id: string
  month: string
  amount_cad: number
  created_at: string
}

export interface Document {
  id: string
  name: string
  category: string
  file_path: string
  file_size: number | null
  expiry_date: string | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

export interface ChatThread {
  id: string
  title: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  thread_id: string
  role: 'user' | 'assistant'
  content: string
  created_by: string | null
  created_at: string
}

export interface KnowledgeSource {
  id: string
  name: string
  type: 'document' | 'conversation' | 'manual'
  created_by: string | null
  created_at: string
}

export interface SharedNote {
  id: string
  title: string
  content: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UsefulLink {
  id: string
  title: string
  url: string
  category: string | null
  description: string | null
  position: number
  created_at: string
}

export interface LookupValue {
  id: string
  list_key: string
  value: string
  position: number
  created_at: string
}

export interface UserPreference {
  id: string
  user_id: string
  key: string
  value: string[]
  updated_at: string
}

export interface AppSettings {
  id: string
  departure_date: string | null
  airbnb_end_date: string | null
  updated_at: string
}
