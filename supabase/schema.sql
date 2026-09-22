-- 江江約會 — Supabase / Postgres schema（原型）
-- 在 Supabase SQL Editor 整段執行即可。
-- 警告：下方 RLS 允許 anon 寫入，僅供 jj-manage 原型；上線前務必改為認證／service role。

-- ---------------------------------------------------------------------------
-- members：對應 js 會員物件（active / heat / views / photos 等）
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id text primary key,
  name text not null,
  age integer not null default 22 check (age >= 22),
  city text not null default '',
  gender text not null default '女',
  bio text not null default '',
  interests jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  avatar_hue integer not null default 210,
  created_days_ago integer not null default 0,
  heat integer not null default 50,
  views integer not null default 0,
  photos jsonb not null default '[]'::jsonb,
  photo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists members_active_idx on public.members (active);
create index if not exists members_city_idx on public.members (city);
create index if not exists members_heat_idx on public.members (heat desc);
create index if not exists members_views_idx on public.members (views desc);
create index if not exists members_created_days_ago_idx on public.members (created_days_ago);

comment on table public.members is '江江約會會員；active=啟用；photos 可為 data URL 或 Storage 公開 URL';
comment on column public.members.active is '對應前台 active；未啟用者前台不顯示';
comment on column public.members.photos is '最多 6 張；jsonb 字串陣列';
comment on column public.members.heat is '熱門分數';
comment on column public.members.views is '瀏覽次數';
comment on column public.members.created_days_ago is '相對「幾天前建立」排序用（與既有 demo 相容）';

-- ---------------------------------------------------------------------------
-- reviews：評價獨立表（對應 member.reviews[]）
-- body ↔ text；images ↔ photos；at 為顯示用時間字串
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id text primary key,
  member_id text not null references public.members (id) on delete cascade,
  body text not null default '',
  images jsonb not null default '[]'::jsonb,
  at text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists reviews_member_id_idx on public.reviews (member_id);
create index if not exists reviews_created_at_idx on public.reviews (created_at desc);

comment on table public.reviews is '會員評價；images 最多 4 張';
comment on column public.reviews.body is '評價文字（前端欄位名 text）';
comment on column public.reviews.images is '評價圖片（前端欄位名 photos）';
comment on column public.reviews.at is '顯示用時間，例如 2026/09/22 17:04';

-- ---------------------------------------------------------------------------
-- RLS：原型策略（不安全 — 僅示範）
-- 前台：任何人可讀 active 會員與其評價；管理頁：anon 可增刪改（之後請加 auth）
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.reviews enable row level security;

-- 清掉舊政策（可重複執行）
drop policy if exists "members_select_active" on public.members;
drop policy if exists "members_select_all_anon" on public.members;
drop policy if exists "members_insert_anon" on public.members;
drop policy if exists "members_update_anon" on public.members;
drop policy if exists "members_delete_anon" on public.members;
drop policy if exists "reviews_select_for_active_members" on public.reviews;
drop policy if exists "reviews_select_all_anon" on public.reviews;
drop policy if exists "reviews_insert_anon" on public.reviews;
drop policy if exists "reviews_update_anon" on public.reviews;
drop policy if exists "reviews_delete_anon" on public.reviews;

-- 讀：anon／authenticated 可讀「啟用中」會員（前台）
-- 管理頁也需讀到停用會員 → 另開 anon 全讀（原型）
create policy "members_select_all_anon"
  on public.members for select
  to anon, authenticated
  using (true);

create policy "members_insert_anon"
  on public.members for insert
  to anon, authenticated
  with check (true);

create policy "members_update_anon"
  on public.members for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "members_delete_anon"
  on public.members for delete
  to anon, authenticated
  using (true);

create policy "reviews_select_all_anon"
  on public.reviews for select
  to anon, authenticated
  using (true);

create policy "reviews_insert_anon"
  on public.reviews for insert
  to anon, authenticated
  with check (true);

create policy "reviews_update_anon"
  on public.reviews for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "reviews_delete_anon"
  on public.reviews for delete
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Storage：bucket「photos」公開讀、anon 可上傳
-- （在 Dashboard → Storage 建立同名 bucket 亦可；此段用 SQL 確保一致）
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos_public_read" on storage.objects;
drop policy if exists "photos_anon_upload" on storage.objects;
drop policy if exists "photos_anon_update" on storage.objects;
drop policy if exists "photos_anon_delete" on storage.objects;

create policy "photos_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'photos');

create policy "photos_anon_upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'photos');

create policy "photos_anon_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'photos')
  with check (bucket_id = 'photos');

create policy "photos_anon_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'photos');
