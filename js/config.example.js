/**
 * 江江約會 — 雲端設定範本
 * 複製為 config.js 後填入 Supabase 專案 URL 與 anon key，並將 enabled 設為 true。
 * 詳見 SUPABASE-SETUP.md
 *
 * HTML 需依序載入：
 *   1. https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 *   2. js/config.js
 *   3. js/cloud.js
 *   4. js/data.js → js/storage.js → …
 */
window.XINXIAN_CLOUD = {
  /** 設為 true 且填妥下方欄位後，會員／評價改走 Supabase */
  enabled: false,
  /** Project Settings → API → Project URL */
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  /** Project Settings → API → anon public key（可公開於靜態站，但仍勿濫用） */
  supabaseAnonKey: "YOUR_ANON_KEY"
};
