# 江江約會

合法交友／配對平台原型（靜態網站）。

## 啟動

```bash
cd dating-platform
python3 -m http.server 8765
```

瀏覽器開啟：http://127.0.0.1:8765/

## 頁面

- 首頁：`index.html`（18+ 告知、北中南入口）
- 地區瀏覽：`browse.html?region=north|central|south`
- 管理後台（不公開連結）：`jj-manage.html`
  - 完整網址示例：http://127.0.0.1:8765/jj-manage.html

舊的 `admin.html` 會導回首頁。

## 說明

- 示範資料與後台變更存在瀏覽器 `localStorage`
- 照片／評價圖片會壓縮後存本機
- 前台一頁 9 位、一排 3 張大圖名片

## 雲端資料（可選）

預設仍用瀏覽器 localStorage。若要讓所有訪客共用會員／評價，請接 Supabase，步驟見 `SUPABASE-SETUP.md`。設定檔：`js/config.js`（範本：`js/config.example.js`）。
