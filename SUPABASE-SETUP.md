# 江江約會：Supabase 雲端設定（繁體中文）

GitHub Pages 只能放靜態檔，無法自己持久化「所有訪客共用」的會員／評價。請用免費 Supabase（Postgres + Storage）當後端。

## 安全警告（必讀）

本原型的 RLS 允許 **anon（匿名金鑰）對 members／reviews 做 SELECT／INSERT／UPDATE／DELETE**，且 Storage bucket `photos` 允許 anon 上傳。這代表：**任何拿到網址與 anon key 的人都能改資料**。

- 僅供 `jj-manage.html` 管理原型與示範。
- **正式上線前**請改為：管理員登入（Supabase Auth）或僅用 **service role**（絕不可放進前端）寫入；前端 anon 只留讀取啟用中會員。
- anon key 本來就可公開於前端，但「開放寫入」才是風險來源。

## 步驟

### 1. 建立免費專案

1. 開啟 [https://supabase.com](https://supabase.com) 註冊／登入。
2. 建立新專案（選離你近的區域即可）。
3. 等待專案就緒。

### 2. 執行資料庫 schema

1. 左側選 **SQL Editor** → New query。
2. 打開本專案的 `supabase/schema.sql`，整段貼上後按 **Run**。
3. 成功後應有資料表：`public.members`、`public.reviews`，以及 Storage bucket：`photos`（公開讀取）。

若 Storage 那段因權限失敗，可改在 Dashboard → **Storage** → New bucket：

- Name：`photos`
- Public bucket：開啟
- 再於 Policies 允許 anon 對 `photos` 的 SELECT／INSERT（UPDATE／DELETE 可選）

### 3. 取得 URL 與 anon key

1. 專案 **Settings** → **API**。
2. 複製 **Project URL**。
3. 複製 **anon public** key（不是 service_role）。

### 4. 填入網站設定

1. 參考 `js/config.example.js`。
2. 編輯 `js/config.js`：

```js
window.XINXIAN_CLOUD = {
  enabled: true,
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOi..."
};
```

3. 確認 HTML 腳本順序（已寫在 `browse.html`、`match.html`、`jj-manage.html`）：

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js"></script>
<script src="js/cloud.js"></script>
<script src="js/data.js"></script>
<script src="js/storage.js"></script>
…
```

### 5. 驗證

1. 用本機或 GitHub Pages 開啟網站。
2. 開啟 `jj-manage.html`，頁首應顯示「雲端模式…」。
3. 新增／編輯會員、評價，用另一瀏覽器／無痕視窗開啟 `browse.html`，應看到相同資料。
4. 若 `enabled: false` 或未填 key：網站繼續用 **localStorage**，離線仍可運作。

## 資料對應

| 前端（JS） | Postgres |
| --- | --- |
| `member.id/name/age/city/gender/bio` | `members` 同名欄位 |
| `member.active` | `members.active` |
| `member.photos[]` / `photo` | `members.photos` (jsonb) / `photo` |
| `member.heat` / `views` / `createdDaysAgo` | `heat` / `views` / `created_days_ago` |
| `member.interests[]` | `interests` (jsonb) |
| `member.avatarHue` | `avatar_hue` |
| `review.text` / `photos` / `at` | `reviews.body` / `images` / `at` |

喜歡、略過、配對、18+ 年齡門仍只存在**各訪客本機**，不會上雲。

## 照片說明

目前管理頁壓縮後的 JPEG **data URL** 可直接存進 `photos`／`images` 欄位（原型方便）。資料量大時建議改上傳到 Storage bucket `photos`（`js/cloud.js` 提供 `uploadDataUrl` 輔助），再把公開 URL 存進欄位。

## 關閉雲端

把 `js/config.js` 的 `enabled` 設回 `false`（或清空 URL／key）。網站會自動回到 localStorage。
