-- 23ai: emailuri de alertă pentru evenimente (funcția events-alerts).
--   1. alerte după nume: rândurile din event_alerts (create din caseta de căutare, la apăsarea butonului „Anunță-mă”)
--   2. rezumat săptămânal din preferințe: event_preferences.event_alerts = true (bifa explicită din profil)
-- Depinde de 20261112_events.sql, 20261112_event_preferences.sql, 20261112_events_search.sql.
-- Documentație: supabase/SCHEMA.md

-- Când a intrat evenimentul în baza noastră (updated_at se schimbă la fiecare sincronizare, deci nu e bun pentru „nou”).
alter table public.events add column if not exists first_seen_at timestamptz;
update public.events set first_seen_at = coalesce(updated_at, now()) where first_seen_at is null;
alter table public.events alter column first_seen_at set default now();
alter table public.events alter column first_seen_at set not null;
create index if not exists events_first_seen on public.events (first_seen_at);

-- Ce am trimis și cui: evită dublurile (event_ids) și limitează frecvența (sent_at). Scrie doar service role.
create table if not exists public.event_mail_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('name', 'digest')),
  event_ids text[] not null default '{}',
  sent_at timestamptz not null default now()
);
create index if not exists event_mail_log_user on public.event_mail_log (user_id, sent_at desc);
alter table public.event_mail_log enable row level security;

-- Dezabonare din linkul din email, fără cont: oprește rezumatul și anulează alertele încă neîmplinite.
-- Același token ca la newsletter (subscribers.unsubscribe_token); newsletterul rămâne neschimbat.
create or replace function public.unsubscribe_alerts(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select user_id into uid from public.subscribers where unsubscribe_token = p_token;
  if uid is null then return false; end if;
  update public.event_preferences set event_alerts = false where user_id = uid;
  update public.event_alerts set notified_at = coalesce(notified_at, now()) where user_id = uid and notified_at is null;
  return true;
end $$;
grant execute on function public.unsubscribe_alerts(uuid) to anon, authenticated;
