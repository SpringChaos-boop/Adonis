-- =====================================================================
--  Горицвет — схема Supabase
--
--  Что делает скрипт:
--    • таблица site_content с JSON-документом контента (одна строка);
--    • история версий content_history (автоматически при каждом сохранении);
--    • RLS: читают все, пишет только авторизованный владелец;
--    • bucket media в Storage для изображений.
--
--  Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
--  Скрипт можно запускать повторно: объекты создаются «если нет».
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Контент сайта
-- ---------------------------------------------------------------------
create table if not exists public.site_content (
  id         text primary key default 'goritsvet',
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- ---------------------------------------------------------------------
-- 2. История версий (страховка от неудачной правки)
-- ---------------------------------------------------------------------
create table if not exists public.content_history (
  id         bigint generated always as identity primary key,
  content_id text not null,
  data       jsonb not null,
  saved_at   timestamptz not null default now(),
  saved_by   uuid references auth.users (id)
);

create index if not exists content_history_content_id_idx
  on public.content_history (content_id, saved_at desc);

-- ---------------------------------------------------------------------
-- 3. Триггеры
-- ---------------------------------------------------------------------
create or replace function public.touch_content()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch
  before update on public.site_content
  for each row execute function public.touch_content();

-- Снимок предыдущей версии. SECURITY DEFINER — чтобы писать в историю
-- мог только этот триггер, а не любой авторизованный пользователь.
create or replace function public.snapshot_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.content_history (content_id, data, saved_by)
  values (old.id, old.data, old.updated_by);
  return new;
end;
$$;

revoke all on function public.snapshot_content() from public;
grant execute on function public.snapshot_content() to authenticated;

drop trigger if exists site_content_history on public.site_content;
create trigger site_content_history
  after update on public.site_content
  for each row execute function public.snapshot_content();

-- ---------------------------------------------------------------------
-- 4. Права и RLS
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant insert, update on public.site_content to authenticated;
grant select on public.content_history to authenticated;

alter table public.site_content enable row level security;
alter table public.content_history enable row level security;

drop policy if exists "site_content read" on public.site_content;
create policy "site_content read"
  on public.site_content for select
  using (true);

drop policy if exists "site_content insert" on public.site_content;
create policy "site_content insert"
  on public.site_content for insert
  to authenticated
  with check (true);

drop policy if exists "site_content update" on public.site_content;
create policy "site_content update"
  on public.site_content for update
  to authenticated
  using (true)
  with check (true);

-- Историю видит только владелец; запись идёт через триггер.
drop policy if exists "history read" on public.content_history;
create policy "history read"
  on public.content_history for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 5. Storage: бакет media для картинок
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  10485760, -- 10 МБ на файл
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "media read" on storage.objects;
create policy "media read"
  on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "media insert" on storage.objects;
create policy "media insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media');

drop policy if exists "media update" on storage.objects;
create policy "media update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media');

drop policy if exists "media delete" on storage.objects;
create policy "media delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media');

-- ---------------------------------------------------------------------
-- 6. Проверка после запуска
-- ---------------------------------------------------------------------
-- select * from public.site_content;          -- строк пока нет — это нормально
-- select * from storage.buckets where id = 'media';
--
-- Первую строку создаст админка при первом «Сохранить на сайт».
