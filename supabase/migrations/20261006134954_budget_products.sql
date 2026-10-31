-- expense_categories_v2_receipts_category_budgets
alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category = any (array[
  'alloggio','cibo','ristoranti','casa','trasporti','telefono','salute','abbigliamento','svago','burocrazia','altro'
]));
alter table public.expenses add column if not exists receipt_path text;
create table if not exists public.category_budgets (
  category text primary key check (category = any (array[
    'alloggio','cibo','ristoranti','casa','trasporti','telefono','salute','abbigliamento','svago','burocrazia','altro'
  ])),
  amount_cad numeric not null check (amount_cad > 0),
  updated_at timestamptz not null default now()
);
alter table public.category_budgets enable row level security;
create policy "Authenticated full access" on public.category_budgets
  for all using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

-- knowledge_embeddings_2048_nemotron
alter table public.knowledge_chunks alter column embedding type vector(2048) using null;

-- expenses_input_currency
alter table public.expenses add column if not exists input_currency text
  check (input_currency in ('CAD', 'EUR'));

-- expense_items_and_store
alter table public.expenses add column if not exists store text;
create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  quantity numeric not null default 1 check (quantity > 0),
  unit text not null default 'pz' check (unit in ('pz', 'kg', 'g', 'l', 'ml')),
  price_cad numeric not null check (price_cad >= 0),
  created_at timestamptz not null default now()
);
create index if not exists expense_items_expense_id_idx on public.expense_items (expense_id);
alter table public.expense_items enable row level security;
create policy "Authenticated full access" on public.expense_items
  for all using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

-- savings_and_incomes
alter table public.budget_settings
  add column if not exists savings_amount numeric check (savings_amount >= 0),
  add column if not exists savings_currency text not null default 'EUR' check (savings_currency in ('EUR', 'CAD')),
  add column if not exists savings_date date;
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  description text not null check (length(trim(description)) > 0),
  amount_cad numeric not null check (amount_cad > 0),
  exchange_rate numeric,
  input_currency text check (input_currency in ('CAD', 'EUR')),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists incomes_date_idx on public.incomes (date);
alter table public.incomes enable row level security;
create policy "Authenticated full access" on public.incomes
  for all using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

-- budget_alerts + budget_alerts_weekly (scritta solo dal server con service role)
create table if not exists public.budget_alerts (
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  kind text not null,
  ref text not null,
  level int not null,
  created_at timestamptz not null default now(),
  primary key (month, kind, ref, level)
);
alter table public.budget_alerts enable row level security;
alter table public.budget_alerts add constraint budget_alerts_kind_check check (kind in ('category', 'month', 'projection', 'weekly'));
alter table public.budget_alerts add constraint budget_alerts_level_check check (level in (0, 80, 100));

-- products_catalog (le categorie sono in lookup_values, vedi supabase/seed.sql)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text not null default 'Altro',
  default_unit text not null default 'pz' check (default_unit in ('pz', 'kg', 'g', 'l', 'ml')),
  created_at timestamptz not null default now()
);
create unique index if not exists products_name_unique on public.products (lower(trim(name)));
alter table public.products enable row level security;
create policy "Authenticated full access" on public.products
  for all using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
alter table public.expense_items add column if not exists product_id uuid references public.products(id) on delete set null;
create index if not exists expense_items_product_id_idx on public.expense_items (product_id);
