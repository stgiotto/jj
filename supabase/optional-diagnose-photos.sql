-- 江江約會 — 選用（非必要）：診斷 base64 照片造成的資料量
-- 網站「不需要」執行這支 SQL 也能運作；遷移請用 jj-manage.html 的「遷移舊照片」按鈕。
-- 在 Supabase SQL Editor 執行即可（唯讀查詢）。

-- 1) 每位會員 photos / photo 欄位佔用的位元組數（越大越可能造成逾時）
select id, name,
       pg_column_size(photos) as photos_bytes,
       pg_column_size(photo)  as photo_bytes,
       left(photo, 5)         as photo_prefix   -- 'data:' 代表仍是 base64
from public.members
order by pg_column_size(photos) desc;

-- 2) 評價圖片佔用
select id, member_id, pg_column_size(images) as images_bytes
from public.reviews
order by pg_column_size(images) desc
limit 50;

-- 3) 還有幾位會員的封面仍是 base64（遷移完成後應為 0）
select count(*) as legacy_members from public.members where photo like 'data:%';
