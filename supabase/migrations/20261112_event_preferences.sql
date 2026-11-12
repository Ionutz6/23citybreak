-- 23ai: ce evenimente îl interesează pe utilizator (genuri muzicale, sporturi, competiții, echipe și artiști favoriți).
-- Folosit de 23citybreak pentru filtrul „Pentru mine” și pentru alertele de evenimente. Privat, ca restul profilului.
-- Documentație: supabase/SCHEMA.md

create table public.event_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  music_genres text[] not null default '{}' check (cardinality(music_genres) <= 20),
  sports text[] not null default '{}' check (cardinality(sports) <= 20),
  competitions text[] not null default '{}' check (cardinality(competitions) <= 20),   -- coduri football-data.org: CL, PL, PD, ...
  other_interests text[] not null default '{}' check (cardinality(other_interests) <= 20),
  favorite_teams text[] not null default '{}' check (cardinality(favorite_teams) <= 20),
  favorite_artists text[] not null default '{}' check (cardinality(favorite_artists) <= 30),
  event_alerts boolean not null default false,   -- acord explicit pentru emailuri cu evenimentele favorite
  updated_at timestamptz not null default now()
);

alter table public.event_preferences enable row level security;
create policy "own event prefs: read" on public.event_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy "own event prefs: insert" on public.event_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own event prefs: update" on public.event_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own event prefs: delete" on public.event_preferences for delete to authenticated using (user_id = (select auth.uid()));
create trigger event_prefs_touch before update on public.event_preferences for each row execute function public.touch_updated_at();
