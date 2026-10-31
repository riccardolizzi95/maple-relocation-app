-- knowledge_trusted_flag
ALTER TABLE public.knowledge_sources ADD COLUMN IF NOT EXISTS trusted boolean NOT NULL DEFAULT false;
DROP FUNCTION IF EXISTS public.match_knowledge(vector, int);
create function public.match_knowledge(
  query_embedding vector(1024),
  match_count int default 5
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  source_name text,
  trusted boolean,
  similarity float
)
language sql stable
as $$
  select
    kc.id,
    kc.source_id,
    kc.content,
    ks.name as source_name,
    ks.trusted,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  join public.knowledge_sources ks on ks.id = kc.source_id
  where kc.embedding is not null
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- knowledge_owner (null = memoria condivisa, valorizzato = personale)
ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- exchange_rates_daily
create table public.exchange_rates (
  date date primary key,
  rate numeric not null,
  created_at timestamptz not null default now()
);
alter table public.exchange_rates enable row level security;
create policy "authenticated read" on public.exchange_rates for select using (auth.uid() is not null);

-- tickets
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('bug','miglioria')),
  page text,
  priority text not null default 'media' check (priority in ('alta','media','bassa')),
  status text not null default 'aperto' check (status in ('aperto','in-lavorazione','risolto')),
  description text,
  steps text,
  device text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tickets enable row level security;
create policy "authenticated all" on public.tickets for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- tickets_v2_workflow
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS origin text CHECK (origin IN ('mobile','desktop'));
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS reopen_reason text;
ALTER TABLE public.tickets DROP CONSTRAINT tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('aperto','in-lavorazione','da-verificare','risolto'));
DROP POLICY "authenticated all" ON public.tickets;
CREATE POLICY "owner or admin select" ON public.tickets FOR SELECT
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'));
CREATE POLICY "owner insert" ON public.tickets FOR INSERT
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "owner or admin update" ON public.tickets FOR UPDATE
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'));
CREATE POLICY "owner or admin delete" ON public.tickets FOR DELETE
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'));

-- recurring_expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS recurring_of uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

-- ticket_events_history
create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  type text not null check (type in ('creato','stato','fix','riaperto','risolto','commento')),
  message text,
  old_status text,
  new_status text,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events(ticket_id, created_at);
alter table public.ticket_events enable row level security;
create policy "read via ticket access" on public.ticket_events
  for select using (
    exists (select 1 from public.tickets t where t.id = ticket_id)
  );
create policy "comment via ticket access" on public.ticket_events
  for insert with check (
    type = 'commento'
    and author_id = auth.uid()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );
create policy "delete own comment" on public.ticket_events
  for delete using (type = 'commento' and author_id = auth.uid());

create or replace function public.log_ticket_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into ticket_events (ticket_id, type, new_status, author_id)
    values (new.id, 'creato', new.status, new.created_by);
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'da-verificare' then
      insert into ticket_events (ticket_id, type, message, old_status, new_status, author_id)
      values (new.id, 'fix', new.resolution_note, old.status, new.status, auth.uid());
    elsif old.status = 'da-verificare' and new.status = 'aperto' then
      insert into ticket_events (ticket_id, type, message, old_status, new_status, author_id)
      values (new.id, 'riaperto', new.reopen_reason, old.status, new.status, auth.uid());
    elsif new.status = 'risolto' then
      insert into ticket_events (ticket_id, type, old_status, new_status, author_id)
      values (new.id, 'risolto', old.status, new.status, auth.uid());
    else
      insert into ticket_events (ticket_id, type, old_status, new_status, author_id)
      values (new.id, 'stato', old.status, new.status, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger ticket_events_log
after insert or update on public.tickets
for each row execute function public.log_ticket_event();
