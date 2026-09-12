# Toolchain: 日文筆記的操作手冊

> Purpose：做這個 project 的實作 know-how — 環境能力、改檔安全作法、踩過的坑。
> 這份是從 Cowork 的專案記憶萃取出來的，讓 Claude Code（桌面版 Code 分頁 / CLI）也讀得到。
> Update when：踩到新的坑、或環境能力改變。不是日誌。
> BUDGET：~200 行。

---

## 0. 最重要的一條：commit 要等使用者說可以

使用者 2026-08-22 明講：「以後 commit 要等我確認完我說可以再 commit，你可以先做。」

- **做內容 → 驗證 → 寫回檔案**：可以直接做，不用問。
- **`git commit` / 上線**：一定要等他說可以。做完只回報「已改好，沒 commit」然後停。
- 他說要 commit 時，先列出會進 commit 的檔案與行數再動手。

理由：他要先自己開檔案看過再決定進不進版控。

---

## 1. 環境能力（依執行環境不同）

| 能力 | Cowork（雲端容器＋device_bash 沙盒） | Claude Code（Local / WSL） |
|---|---|---|
| 執行位置 | 兩個地方：Anthropic 雲端容器 ＋ 你機器上的隔離沙盒 | 直接在你的 Windows／WSL |
| 背景行程能否常駐 | **雲端可以；沙盒不行**（`--die-with-parent`，呼叫結束就殺光） | 可以 |
| 單次指令時限 | 沙盒 45 秒 | 沒有那麼緊 |
| 檔案往你電腦寫 | 上限 **20MB／檔** | 直接寫，無上限 |
| VOICEVOX 引擎 | **只能在雲端容器**（沙盒常駐不了、45 秒連暖機都不夠） | **可以直接跑**，不用每次重裝 1.7GB |

**在 Claude Code 底下，上面那些限制大多消失。** 但下面第 2、3 節的「改檔陷阱」與 git 規則跟環境無關，照樣適用。

### 本機已備妥的東西（2026-08-22 裝好，實測可用）

| 東西 | 版本／位置 |
|---|---|
| VOICEVOX ENGINE | 0.25.2 CPU 版，`winget install --id HiroshibaKazuyuki.VOICEVOX.CPU`。**解壓縮型套件**，裝在 `%LOCALAPPDATA%\Microsoft\WinGet\Packages\HiroshibaKazuyuki.VOICEVOX.CPU_*\VOICEVOX\vv-engine\run.exe`（不是 `Programs\`） |
| ffmpeg | Gyan.FFmpeg 9.0 full build，含 libopus |
| node | v24.19.0（`%PROGRAMFILES%\nodejs`） |
| playwright | 裝在 `docs\語音包工具\node_modules`（`node_modules/` 已進 .gitignore） |
| Python | 3.11.0 |

踩過的兩個小坑：
- **winget 裝完，當下 session 的 PATH 還是舊的**（它自己會說「重新啟動命令介面」）。
  所以 `本機補音檔.py` 會自己 glob 找 ffmpeg 補進 PATH，不依賴 PATH 生效。
- **Windows 主控台是 cp950，印日文會 `UnicodeEncodeError` 直接當掉**。
  腳本開頭設 `PYTHONIOENCODING=utf-8` + `sys.stdout.reconfigure`。

---

## 2. 改 `minna-notes.html`（0.8MB，音檔已外置）的安全作法

檔案內含四個 `<script>` 區塊。改法一律：**正規表示式定位 → 就地換掉那一段 → 重讀驗證**。

### 2.1 `vocab-data` 的縮排一定要保留 —— 踩過

`<script id="vocab-data">` 的內容是
**`'\n' + json.dumps(vd, ensure_ascii=False, indent=2) + '\n'`**（實測與原檔逐字元相同）。

用緊湊的 `json.dumps(vd, ensure_ascii=False)` 寫回會把 4553 行壓成 1 行，
`git diff --numstat` 變成 **`3 4556`**，完全看不出改了什麼、無法 review。
（2026-08-22 commit 前才發現，改回 indent=2 後 diff 回到正常的 75/16。）

- 寫回前 `assert '<' not in pretty`（有裸 `<` 才需轉成 `<`）
- `vv-data` 相反，**本來就壓成一行**，維持 `json.dumps(VV, ensure_ascii=False)`；2026-09-11 起只剩 `say`＋`reading`，音檔在 `docs/audio/<頁>/<id>.ogg`

### 2.2 各區塊的錨點

| 要改的東西 | 位置 | 作法 |
|---|---|---|
| 單字 | `<script id="vocab-data">` 的 `lessons[n]` | 解析 JSON → append → indent=2 寫回 |
| 音檔 | `docs/audio/<頁>/<id>.ogg`＋`vv-data.say` | 交給 `語音包工具\` 的腳本，不要手改；資料夾名以 HTML 的 `VV_BASE` 為準 |
| 文法 | JS 的 ``GRAMMAR_DEFAULT={ n:`…` }`` template literal | 抓該課最後一段的 ``</div></div>` `` 當錨點，插在反引號前 |
| 文法測驗 | JS 的 `QUIZ_GRAMMAR={ n:[…] }` | 抓最後一題的 `exp:'…'}\n]` 當錨點 |
| 強制假名發音 | JS 的 `sayForceKana=new Set([…])` | 字串取代 |

- template literal 內**不能出現反引號或 `${`**
- 測驗題字串是單引號包的，題目／選項／解說裡不能用 `'`（用「」）
- 每次取代都 `assert h.count(anchor)==1`

### 2.3 寫檔與驗證清單（每次都跑）

```python
fd=os.open(P, os.O_WRONLY|os.O_TRUNC); os.write(fd, out.encode('utf-8')); os.fsync(fd); os.close(fd)
```

1. 重讀，`json.loads` 解析 `vocab-data`
2. 抽出**四個** JS 區塊（`<script>` 不含 `type="application/json"` 的），每個都 `node --check`
   （主程式是第 3 塊、約 118KB，**不是最後一塊**）
3. 結尾是 `</html>`、`<script>`／`</script>` 數量相等
4. 同一課無 `(word, kana)` 重複（2026-08-22 起課次從 1 開始，第0課已獨立成 `kana.html`，
   那個「課0是另一套 schema」的特判不再需要）
5. 跑 `語音包工具\test_voice_full.mjs`，並用 Playwright 點進該課該分頁確認新內容真的有 render

### 2.4 版面禁忌
**絕對不要**在 `.wrap` / `#panel-vocab` 加 `overflow-x:auto` —— 三層 sticky 會整個位移約 192px。

### 2.5 導覽結構備忘
主分頁 `#tabs .tab`：第0課（五十音）〜第12課、數字、總學習。
「總學習」底下 `#subtabs .subtab`：其他單字／單字總表／文法總表／朗讀總表／測驗。
各課底下：單字／動詞／文法／朗讀／測驗。**沒有 `#tab-all` 這個 id。**

---

## 3. 語音包

完整操作手冊在 **`docs\語音包工具\README.md`**，那份才是權威。這裡只記關鍵：

- 新增任何內容後都要補音檔。**本機一步跑完**：

  ```
  python docs\語音包工具\本機補音檔.py            # 預設 minna-notes.html
  python docs\語音包工具\本機補音檔.py --engine-only   # 只把引擎叫起來
  ```

  這支會：找 ffmpeg → 沒引擎就自動啟動 `vv-engine\run.exe`（無介面、約 4 秒、之後常駐）
  → `export_missing_clips.py`（看 `docs/audio/<頁>/` 缺哪些檔、合成，包丟暫存）→ `merge_clips.py`（寫成 .ogg、只更新 say）。
  缺 0 個就原地結束，HTML 一個字元都不動。
- **音檔外置（2026-09-11）**：clip 是獨立 .ogg，點到才載入；`VV_AUDIO` 只是 id 集合，`VV_PLAYER.src=VV_BASE+id+'.ogg'`。
  整句音檔很貴：一個 clip 3〜5KB，「加入單字」1,650 個就 8MB，加功能前先估數量。
- 文本來源必須是**單字 ＋ HTML 所有 `data-say` 的聯集**。只收單字會漏掉文法例句（踩過）。
- 收 `data-say` 時要過濾 `data-say="'+esc(x)+'"`、`data-say="${q.say}"` 這種**還沒求值的 JS 樣板字串**，
  否則會合成一堆垃圾音檔（踩過，檔案胖 0.6MB）。
- **新增一個聲音很貴**:整套 1686 個文本要重產一次,實測 **2.5〜3 秒/clip → 50〜80 分鐘**、
  檔案 **+5.8MB**;而且 `export_missing_clips.py` 只涵蓋 621 個文本(五十音、朗讀逐行、
  時間/數字拼讀單位不在它的來源裡),要加聲音得以 vv-data 現有 say key 為準。
  2026-08-22 試加 Emily(冥鳴ひまり 14)產到一半放棄,已還原。
- **clip id = `md5(speaker + '|' + text)` 前 12 碼**；文本正規化要去掉 `～ ~ ［ ］ [ ]`、全形空白→半形、trim。
  這兩條跟前端對不上 → 音檔存在但查不到，**不會報錯**。
- 新增漢字詞先問引擎它會怎麼唸（`/audio_query` 回傳的 moras），對不上就加進 `sayForceKana`。
  實例：「水餃」被唸成「ミズ」。
- 三角色：Chloe=四国めたん(2，聲音A預設)、Darren=玄野武宏(11，聲音B預設)、Uncle Ben=青山龍星(13)。
- **n5-mock-easy.html 的音檔是獨立一套**（2026-09-11）：`mock_audio.py` 一步跑完。key 是「角色|文本」，F/M/N = speaker 2/11/13；
  readChoices 的題目號碼「N|1ばん。」與選項「N|選項」分開兩段（選項會洗牌，整句合成會對不上而退回瀏覽器語音，2026-09-12 踩到）；`--prune` 刪多餘 clip。坑：把 JS 字面值交給 node 轉 JSON 時 stdin 要 `setEncoding("utf8")`，
  否則分塊邊界切到日文字會變亂碼、合成出壞 clip。漢字唸錯（如 何まい→ナニマイ）直接把對白改成假名，沒有 sayForceKana。
  題庫欄位：`img`＋`fixed:true` = 四格圖片題（c 固定 1〜4、a = 正解格−1）；`scene:{img}` = 發話表現場景圖；圖放 `docs/img/mock/`
  （ChatGPT 產的合圖用 Pillow 偵測黑格線切開、灰階 16 色 PNG，四格題約 80KB、場景 20KB）。
- **動詞小抽考「加入單字」**（2026-09-11）：搭配表在 `<script id="vobj-data">`（key 動詞 `word|kana` → [助詞, 名詞 word, 中文]），前端 `vbPool()` 只取到本課為止的名詞；
  文本「名詞假名＋助詞＋空格＋活用形」由 export 的 E 段同規則產生。新動詞要補搭配、名詞多讀音只取第一行。
- **三個頁面各有測試**：`test_voice_full.mjs`（minna-notes，38 項）、`test_kana.mjs`（kana.html，20 項）、`test_mock.mjs`（n5-mock，35 項）。
  `本機補音檔.py` 兩個頁面都吃（export 會自己判斷是 `vocab-data` 還是 `kana-data`）。
- 驗證：`node docs\語音包工具\test_voice_full.mjs [html]`（預設 minna-notes.html）。
  2026-08-22 改成本機版：用 playwright 自帶的 chromium、路徑由參數決定，
  原本寫死的 `stat.clips === N` 斷言改成「say 指到的 clip 都存在」（數量只印出來），
  這樣補完音檔不用手改測試、也不會再出現與本次改動無關的假 FAIL。

---

## 4. Git

三條鐵律與日常節奏在 `CLAUDE.md`。以下是補充：

- **CRLF**：Windows 工作目錄是 CRLF、index 是 LF，`git status` 會顯示假的 `M`。
  判斷真差異一律加 `--ignore-cr-at-eol`（**只有 diff 有這個選項，status 沒有**）。
- **diff 爆 token**：HTML 是超長單行，用 `--numstat`；要看內容再
  `git diff … | grep -E "^[+-][^+-]" | cut -c1-150`。
- `docs\工具\git-wrap.sh` 的 `g` / `publish` 是為了繞開「device_bash 不能刪 `.lock`」而生的。
  **在 Claude Code 底下可以直接用原生 git**，那些包裝不再必要（但也不會壞）。
- `.git` 在 Windows 這台有 321MB（211 個 loose object 從沒 gc 過；GitHub 端只有 61MB）。想瘦身跑 `git gc`（使用者決定）；Mac 用 clone 拿到的天生就是打包好的。
- GitHub 限制其實很寬：單檔 push 100MB 才擋（50MB 起警告）、Pages 站台 1GB。音檔外置後 HTML 0.8MB、`docs/audio/` 36MB／11,526 檔。

---

## 5. 雜項

- **HEIC 照片**（使用者的手寫筆記）：ffmpeg 開不了（`moov atom not found`）。
  用 `pip install pillow-heif` 再走 PIL 轉 PNG。橫拍的要 `rotate(90, expand=True)` 才看得懂。
- **Playwright**：本機已裝在 `docs\語音包工具\node_modules`（`npm install playwright` + `npx playwright install chromium`），
  直接 `import { chromium } from 'playwright'`、`chromium.launch()` 即可。
  （Cowork 雲端容器才需要絕對路徑 require 與 `executablePath: '/opt/pw-browsers/chromium'`。）
- 學習進度與備註存 localStorage（`jp_user_notes` / `jp_user_allorder` 等），
  **per-origin**，本機 `file://` 和線上各自獨立，這是正常的。
- 本機 stop hook 會建議把 commit email 改成 `noreply@anthropic.com`，**不要照做**。

- **Bash 工具的 heredoc 會把 `\\` 縮成 `\`**(2026-09-08 踩到:regex `[\\/]` 變成只剩 `/`,替換沒生效也不報錯;
  多檔替換腳本又在後面才 assert,前面的檔已經寫下去了)。含反斜線的 Python 一律用 Write 寫成 .py 再 `python 檔名` 跑,
  不要 `python - <<EOF`;多檔替換先全部算完、最後一起寫。

---

## 6. 兩台電腦同步（2026-09-08 起整個專案資料夾就是 repo）

- **開工先 `git pull`**、收工 push；CLAUDE.md、_context/ 都在 git 裡，另一台改過的東西靠這個過來。
- 網站只發布 `docs/`（GitHub Pages = main /docs）；`output/ input/ _to_delete/` 在 .gitignore，不會同步。
- 換行：Windows 這台 system 層級 `core.autocrlf=true`、Mac 不設；root `.gitattributes` 的 `* text=auto` 讓 repo 內一律 LF。
- 日文資料夾名（語音包工具／工具）：兩台都 `git config --global core.precomposeunicode true`（Mac 必要、Windows 無害）。
- **新 clone 之後**：`cd docs/語音包工具 && npm ci && npx playwright install chromium`（node_modules 與 Chromium 不在 repo）。
- **Mac 這台已備妥（2026-09-10）**：repo 在 `~/Robin/Claude/日文學習/japanese-notes`（HTTPS remote；push 的憑證走 GitHub CLI：`gh auth login` 一次＋`gh auth setup-git`，
  token 在 macOS keychain。git 提示問帳密時**不要打密碼**，GitHub 不收）；
  Homebrew 6 → node v26.8 / ffmpeg 9.0.1（含 libopus）；Playwright Chromium 已裝；`test_voice_full.mjs`、`test_kana.mjs` 全 PASS。
  Python 是系統內建 3.9（Windows 3.11），遇到新語法再 `brew install python`。
- **Mac 也能產音檔了（2026-09-10）**：VOICEVOX ENGINE 0.25.2 macOS arm64（GitHub release 的 7z，1.8GB → 解壓 2.0GB）
  放在 `~/Applications/voicevox_engine/macos-arm64/run`，不進 git；`本機補音檔.py` 的 `ENGINE_GLOBS` 在非 Windows 時改找這裡。
  新下載的引擎要先 `xattr -dr com.apple.quarantine`，否則 Gatekeeper 擋。四個 speaker id（2/11/13/14）與 Windows 相同，
  「水餃→ミズ」的唸法也一致。啟動約 18 秒，之後常駐。`python3 docs/語音包工具/本機補音檔.py` 兩台用法相同。
- `本機補音檔.py` 只吃 minna-notes（vocab-data）與 kana.html（kana-data）；n5-vocab.html 沒這兩個區塊，會直接說不知道要合成什麼（設計如此）。
- Claude Code 的 project 狀態（`~/.claude/projects/<路徑 key>`）綁絕對路徑，session 不跨機器；兩台各開各的 session，靠 git 同步。
