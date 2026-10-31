-- rls_auto_enable: RLS automatica sulle nuove tabelle in public
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

-- push_subscriptions_and_ticket_webhook
create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Il trigger chiama la route dell'app che invia la push: sostituire l'URL con quello del proprio deploy.
-- Il payload contiene solo l'id del ticket; la route rilegge il contenuto dal DB.
create or replace function public.notify_ticket_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if (new.status = 'da-verificare' and old.status is distinct from 'da-verificare')
     or (new.status = 'aperto' and old.status = 'da-verificare') then
    perform net.http_post(
      url := 'https://your-app.example.com/api/push/ticket-event',
      body := jsonb_build_object('ticket_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;

create trigger tickets_push_notify
after update on public.tickets
for each row execute function public.notify_ticket_push();

-- harden_profiles_role_security
drop policy if exists "Authenticated full access" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles
  for select using (auth.uid() is not null);
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "insert own profile" on public.profiles
  for insert with check (id = auth.uid());

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Il ruolo può essere modificato solo dalla Gestione utenti (admin)';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();
revoke execute on function public.protect_profile_role() from anon, authenticated;

-- lockdown_definer_functions_and_search_path
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.log_ticket_event() from anon, authenticated;
revoke execute on function public.notify_ticket_push() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
alter function public.handle_new_user() set search_path = public;
alter function public.match_knowledge(vector, integer) set search_path = public;

-- revoke_definer_functions_from_public
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.log_ticket_event() from public;
revoke execute on function public.notify_ticket_push() from public;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.protect_profile_role() from public;

-- expenses_recurring_unique_and_author_default
create unique index if not exists expenses_recurring_of_date_key
  on public.expenses (recurring_of, date);
alter table public.expenses alter column created_by set default auth.uid();

-- drop_legacy_ai_conversations
drop table if exists public.ai_conversations;
