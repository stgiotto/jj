# 江江約會：GitHub Pages 部署指南

請在你的 Windows 電腦 DESKTOP-4A7LVC6 上完成以下操作。由於 Grok Bot 使用的電腦目前被 GitHub 顯示「Access is temporarily restricted」，請不要在 Grok Bot 的電腦建立或推送 GitHub 儲存庫；請由你的電腦操作。

1. **在 GitHub 建立公開儲存庫**
   登入 GitHub，按右上角「+」→「New repository」。Repository name 建議填 `jiangjiang-dating`，選 **Public**，並先不要勾選建立 README、.gitignore 或 License，然後按「Create repository」。

2. **準備網站檔案**
   將 `jiangjiang-dating.tar.gz` 複製到你的 Windows 電腦，使用 7-Zip／Windows 解壓縮，或直接使用網站資料夾內容。最後請確認準備好的資料夾本身就是網站根目錄，且第一層直接有 `index.html`（不是多包一層 `dating-platform` 資料夾）。

3. **在 Windows 開啟 Git Bash 並初始化 Git**
   安裝 Git for Windows 後，開啟 Git Bash，切換到放有 `index.html` 的資料夾，例如：
   ```bash
   cd "/c/Users/<你的Windows使用者名稱>/Desktop/jiangjiang-dating"
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   ```

4. **連結 GitHub 並推送檔案**
   把 `<username>` 換成你的 GitHub 使用者名稱，執行：
   ```bash
   git remote add origin https://github.com/<username>/jiangjiang-dating.git
   git push -u origin main
   ```
   若 GitHub 要求登入，依畫面使用瀏覽器登入或 Git Credential Manager；不要把 GitHub 密碼直接寫進指令。

5. **啟用 GitHub Pages**
   開啟該 GitHub 儲存庫的「Settings」→左側「Pages」。在「Build and deployment」的 Source 選「Deploy from a branch」，Branch 選 `main`，資料夾選 `/ (root)`，按「Save」。等待部署完成後，網址通常是：
   `https://<username>.github.io/jiangjiang-dating/`

6. **確認專案頁面的路徑**
   我已檢查目前網站的 HTML、JavaScript 和 CSS：頁面、樣式、腳本及示範圖片都使用相對路徑（例如 `css/styles.css`、`js/app.js`、`img/demo/1.svg`），沒有發現以 `/` 開頭的網站根目錄絕對路徑，因此目前不需要加 `<base href>`，在上述 Project Pages 網址下應可正常運作。若日後新增 `/css/...`、`/js/...` 或 `/img/...` 這類絕對路徑，它們會錯指到 `https://<username>.github.io/`；請改成相對路徑，或在所有相關頁面設定 `<base href="/jiangjiang-dating/">`，也可以改用自訂網域或 User Pages。

7. **了解目前資料與管理頁面限制**
   目前配對、按讚、略過、年齡確認及後台變更都只存在各個瀏覽器的 `localStorage`；會員／評價可改接 Supabase 跨訪客同步（見 SUPABASE-SETUP.md）；喜歡／略過／配對與年齡確認仍只存在各瀏覽器 localStorage。管理頁面是 `jj-manage.html`，可在部署後以 `https://<username>.github.io/jiangjiang-dating/jj-manage.html` 開啟；它只是隱藏網址（obscurity），沒有密碼保護，不可當作安全的管理後台。

8. **測試部署結果**
   開啟首頁網址，測試北部、中部、南部連結、圖片、瀏覽器重新整理，以及 `jj-manage.html`。若剛按「Save」看不到網站，請等待幾分鐘後重新整理，並到 Settings → Pages 查看部署狀態。
