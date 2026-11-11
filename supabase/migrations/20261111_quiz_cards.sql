-- Imaginile de scor pentru emailul cu rezultatul. Bucket public (linkul e greu de ghicit), fiecare jucător scrie doar în folderul lui.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-cards', 'quiz-cards', true, 2097152, array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "quiz cards: upload own" on storage.objects for insert to authenticated
with check (bucket_id = 'quiz-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
