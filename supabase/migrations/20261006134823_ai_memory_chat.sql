create extension if not exists vector;

-- Conversazioni condivise
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages(thread_id, created_at);

-- Base di conoscenza condivisa
create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('document','conversation','manual')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  content text not null,
  embedding vector(1024),
  created_at timestamptz not null default now()
);
create index knowledge_chunks_source_idx on public.knowledge_chunks(source_id);

-- RLS: workspace condiviso, qualsiasi utente autenticato
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;

create policy "authenticated all" on public.chat_threads for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated all" on public.chat_messages for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated all" on public.knowledge_sources for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated all" on public.knowledge_chunks for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Ricerca vettoriale
create or replace function public.match_knowledge(
  query_embedding vector(1024),
  match_count int default 5
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  source_name text,
  similarity float
)
language sql stable
as $$
  select
    kc.id,
    kc.source_id,
    kc.content,
    ks.name as source_name,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  join public.knowledge_sources ks on ks.id = kc.source_id
  where kc.embedding is not null
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
