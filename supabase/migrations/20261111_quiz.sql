-- 23ai: bază comună de emailuri (23ai + 23citybreak) și scorurile quizului „Ghicește orașul”.

create table public.subscribers (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  newsletter boolean not null default false,
  consent_text text,
  consent_at timestamptz,
  source text not null default '23citybreak-quiz',
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique
);

create table public.quiz_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  quiz text not null default 'ghiceste-orasul',
  site text not null default '23citybreak',
  score int not null check (score between 0 and 1500),
  correct int not null check (correct between 0 and 10),
  played_at timestamptz not null default now()
);
create index quiz_scores_quiz_user on public.quiz_scores (quiz, user_id, score desc);

alter table public.subscribers enable row level security;
alter table public.quiz_scores enable row level security;

create policy "own subscriber row: read" on public.subscribers for select to authenticated using (user_id = (select auth.uid()));
create policy "own subscriber row: insert" on public.subscribers for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own subscriber row: update" on public.subscribers for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own scores: read" on public.quiz_scores for select to authenticated using (user_id = (select auth.uid()));
create policy "own scores: insert" on public.quiz_scores for insert to authenticated with check (user_id = (select auth.uid()));

-- Clasamentul pe cel mai bun scor al fiecărui jucător. Nu expune scorurile altora, doar poziția ta.
create or replace function public.my_quiz_rank(p_quiz text default 'ghiceste-orasul')
returns table (best int, best_correct int, players int, rank int, top_pct int)
language sql stable security definer set search_path = ''
as $$
  with b as (
    select user_id, max(score) as s from public.quiz_scores where quiz = p_quiz group by user_id
  ), me as (select s from b where user_id = auth.uid())
  select me.s,
         (select max(q.correct) from public.quiz_scores q where q.user_id = auth.uid() and q.quiz = p_quiz and q.score = me.s),
         (select count(*) from b)::int,
         (select count(*) from b where b.s > me.s)::int + 1,
         greatest(1, ceil(100.0 * ((select count(*) from b where b.s > me.s) + 1) / (select count(*) from b)))::int
  from me;
$$;
revoke execute on function public.my_quiz_rank(text) from public, anon;
grant execute on function public.my_quiz_rank(text) to authenticated;

-- Dezabonare din linkul din email, fără cont.
create or replace function public.unsubscribe(p_token uuid)
returns boolean language sql security definer set search_path = ''
as $$
  update public.subscribers set newsletter = false, unsubscribed_at = now()
  where unsubscribe_token = p_token returning true;
$$;
grant execute on function public.unsubscribe(uuid) to anon, authenticated;
