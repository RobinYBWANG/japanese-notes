# 網站統計 Worker（ga-stats）

`docs/stats.html` 背後的服務：輸入密碼後，這個 Cloudflare Worker 用 Google 服務帳號去問 GA，
把資料傳回頁面，頁面再翻成中文。金鑰和密碼只存在 Cloudflare，不在 GitHub 上。

- 程式：`src/index.js`（只跑固定的 5 個查詢：即時 2 個、報表 3 個）
- 設定：`wrangler.toml`（GA 資源編號 `559817851`、只放行 `robinybwang.github.io`）
- 測試：`node test.mjs`（用假的 Google 回應，不連網）；頁面測試在 `docs/語音包工具/test_stats.mjs`
- 費用：Cloudflare Workers 免費版（每天 10 萬次）、GA Data API 免費，電腦不用開著

## 第一次設定（只做一次，帳密與金鑰都由 Robin 自己操作）

### 一、Google Cloud：建一個只能讀 GA 的服務帳號

1. 開 <https://console.cloud.google.com/>，用管理 GA 的同一個 Google 帳號登入，建立新專案，名稱可以叫 `japanese-notes-stats`。
2. 左上選單 →「API 和服務」→「程式庫」→ 搜尋 **Google Analytics Data API** → 啟用。
3. 左上選單 →「IAM 與管理」→「服務帳號」→「建立服務帳號」，名稱 `ga-reader`；角色那步直接跳過，按完成。
4. 點進剛建好的服務帳號 →「金鑰」分頁 →「新增金鑰」→「建立新的金鑰」→ 選 **JSON** → 會下載一個 `.json` 檔。
   **這個檔就是金鑰，不要傳給任何人、不要放進 repo**。
5. 記下服務帳號的電子郵件，長得像 `ga-reader@japanese-notes-stats.iam.gserviceaccount.com`。

### 二、GA：讓服務帳號可以「看」資料

GA →「管理」→「資源存取權管理」→ 右上「＋」→「新增使用者」→ 貼上上面那個電子郵件，
角色選 **檢視者**，取消「以電子郵件通知新使用者」→ 新增。

### 三、Cloudflare：部署 Worker

1. 到 <https://dash.cloudflare.com/sign-up> 註冊（免費，不用信用卡）。
2. 在終端機進到這個資料夾，登入（會開瀏覽器請你按允許）：

   ```bash
   cd ~/Robin/Claude/日文學習/japanese-notes/worker/ga-stats
   npx wrangler login
   ```

3. 部署（第一次會請你取一個 `workers.dev` 的子網域名稱）：

   ```bash
   npx wrangler deploy
   ```

   最後會印出網址，像 `https://japanese-notes-stats.<子網域>.workers.dev`，記下來。
4. 設定密碼（會請你輸入，建議 12 個字以上、不要跟其他地方一樣）：

   ```bash
   npx wrangler secret put STATS_PASSWORD
   ```

5. 放進金鑰（把路徑換成第一步下載的檔案）：

   ```bash
   npx wrangler secret put GA_KEY < ~/Downloads/japanese-notes-stats-xxxx.json
   ```

6. 金鑰已經在 Cloudflare 了，**把下載的 `.json` 刪掉**。

### 四、接上網站

把第三步的網址填進 `docs/stats.html` 最上面的 `WORKER_URL`，commit、push 之後，
打開 <https://robinybwang.github.io/japanese-notes/stats.html> 輸入密碼就能看。

## 之後要改

- 換密碼：再跑一次 `npx wrangler secret put STATS_PASSWORD`。
- 改查詢內容：改 `src/index.js` → `node test.mjs` → `npx wrangler deploy`；頁面的翻譯在 `docs/stats.html`。
- 懷疑金鑰外洩：到 Google Cloud 的服務帳號刪掉那把金鑰、重建一把，再 `secret put GA_KEY`。服務帳號只有 GA 檢視權限，外洩也只會被看到統計數字。
