# Reference: 日文學習(耐久事實)— durable-facts sink

> Purpose:少變動的耐久事實與已鎖定決策的家 — 讓 progress.md 保持短暫性。
>   不是歷史的事實若值得留,就住這裡(不是 progress.md)。
> Update when:耐久事實改變或決策鎖定(少)。不是日誌。
> FORMAT:一行一事實,帶穩定 ID+狀態,方便冷啟動 grep。
> BUDGET:~250 行(always-load)。

## 檔案(F)— 2026-08-21 母版制度廢除後的配置
- F1 | `docs\minna-notes.html`(16.3MB,2026-08-22 移除第0課後)= 課程筆記本體。本機 `file://` 開=完整編輯模式,從網址開=唯讀。做筆記就改這份 | LOCKED
- F2 | `docs\n5-grammar.html`(59KB)= N5 文法卡,現役 | ACTIVE
- F3 | `docs\n5-vocab.html`(6.8MB)= N5 總單字(**892字**),內嵌 VOICEVOX 冥鳴ひまり(14)預錄音檔 1725 clips,無音調圖 | ACTIVE
- F4 | `docs\n5-mock-easy.html` = N5 模擬考簡易版(含 VOICEVOX 聽解音檔) | ACTIVE
- F5 | `docs\index.html` = 網站首頁,屬網站設計,動之前先問使用者 | LOCKED
- F6 | `docs\語音包工具\` = 語音重建腳本,README.md 是操作手冊。2026-08-21 從專案根目錄搬進 repo | ACTIVE
- F7 | `docs\工具\git-wrap.sh` = git 包裝(`g` / `publish`),Cowork 時代的包裝,本機不用;`_GW_REPO` 已指向專案根 | RETIRED
- F8 | `_to_delete\` = 待刪暫存區,**2026-08-22 已清空**;本機可直接刪檔,這裡只留「不確定要不要留」的東西 | ACTIVE
- F9 | 舊母版 `大家的日本語初級筆記.html`、`N5文法總整理.html`、`N5總單字.html` **2026-08-22 已刪除**(內容由 repo 現役檔取代) | DELETED
- F10 | `build_voice_html.py`(母版→語音版整套替換)已作廢,**2026-08-22 刪除** | DELETED

- F16 | 第5課「助詞」分頁資料在 `JOSHI={n:`…`}`;有資料的課才會出現該分頁。底色 `#fff3e0` 的語意是「**這一課教的**」 | ACTIVE
- F15 | 第5課起的單字**重音欄標「待確認」**:課本照片有重音線,但逐字反推容易數錯,寧可空著(tidy skill 規定) | ACTIVE
- F14 | `語音包工具\gen_grammar_quiz.py` 產文法小考題庫(→ `gquiz-data`)、`gen_reading.py` 產朗讀套組(→ vv-data.reading;`99` 是把各課混合的總表)。單字或詞性改了要重跑,再跑 `本機補音檔.py` | ACTIVE
- F13 | 測試三支:`test_voice_full.mjs`(minna,25 項)、`test_kana.mjs`(kana,19 項)、`test_autoplay.mjs`(小抽考自動發音,12 項) | ACTIVE
- F12 | `docs\kana.html`(2.0MB)= **五十音獨立頁**,104 假名＋例詞＋四題型測驗,自帶 1179 clips;測試 `語音包工具\test_kana.mjs` | ACTIVE
- F11 | `docs\語音包工具\本機補音檔.py` = 本機補音檔唯一入口(起引擎→export→merge);`node test_voice_full.mjs` 驗證 | ACTIVE
- F17 | **整個專案資料夾 = git repo**(2026-09-08 合併,步驟見 journal);`docs\` = GitHub Pages 來源(main /docs);`output\ input\ _to_delete\` 在 .gitignore 不上 git;root `.gitattributes` `* text=auto` 統一 LF | ACTIVE

## 決策(D)
- D1 | **母版制度廢除**:每個檔案只留一份,全部在 repo 裡。線上版本身在本機就是可編輯的,不需要另一份母版 | LOCKED
- D2 | 轉檔流程(build_site.py + site_patches.json)隨母版一起作廢,不要再重建 | LOCKED
- D3 | commit 等使用者說可以才做;push 本機做得到,但**要他明講**才推(2026-08-22 首次由 AI push) | LOCKED
- D4 | 每次新增或修改任何內容,都要順手跑一次 `tidy-japanese-notes` skill,並補產新內容的音檔 | LOCKED
- D5 | 三角色定案:Chloe=四国めたん(2,女,聲音A預設)、Uncle Ben=青山龍星(13,男)、Darren=玄野武宏(11,男,朗讀B預設) | LOCKED
- D6 | 單字是唯一需手動維護的資料源(單詞/假名/重音/中文/pos);文法在 `GRAMMAR_DEFAULT[n]`;朗讀由 `genReadingText()` 產生;測驗由 `buildQuiz`/`buildTotalQuiz` 產生 | LOCKED
- D7 | 不擅自刪使用者已填內容;重音不確定標「待確認」 | LOCKED
- D8 | `n5-grammar.html` 的發音走 Web Speech API(瀏覽器 TTS),不內嵌 VOICEVOX 音檔,保持單檔輕量 | LOCKED
- D11 | `n5-vocab.html` 相反:2026-08-21 起全面改用**冥鳴ひまり(speaker 14)**單角色預錄音檔內嵌,查無 clip 才退回 Web Speech | LOCKED
- D12 | `n5-vocab.html` 補字只補「minna-notes 課本已學過、這份卻沒有」的字;**不收品牌名**;專有名詞(101/グランドホテル/スーパーマン 等)保留 | LOCKED
- D9 | localStorage keys:`n5grammar_progress_v1`、`n5_tts`、`n5_header_collapsed`、`jp_user_notes`、`jp_user_allorder` | LOCKED
- D10 | git 流程(2026-08-22 改):**直接在 `main` 上做,不開分支**,原生 git;commit 等使用者說可以、push 也要他明講。舊 `working` 分支留在本機當還原點 | LOCKED

- D13 | 五十音 2026-08-22 從 minna-notes 第0課獨立成 `kana.html`,minna 不再有第0課(資料、程式、CSS、音檔都清掉);首頁第一張卡就是它 | LOCKED

## 環境(E)
- E1 | 線上網址 https://robinybwang.github.io/japanese-notes/ ;repo `RobinYBWang/japanese-notes`(Public,Pages = main / **docs**(2026-09-08 起;整個專案資料夾 = repo)) | ACTIVE
- E6 | Windows 這台 `core.autocrlf=true`(system 層級)、Mac 不設;`core.precomposeunicode=true` 兩台都設(全域);新 clone 要 `npm ci` + `npx playwright install chromium`(toolchain §6) | ACTIVE
- E2 | git commit 身分已寫進 git-wrap.sh,不用每次帶 `-c`(本機 stop hook 會建議改 email,不要照做) | LOCKED
- E3 | `device_commit_files` 的 devicePath 必須是 Windows 路徑;`device_bash` 只吃 `/sessions/...` 路徑 | LOCKED
- E4 | 雲端容器連不到 `*.github.io` 與 `api.github.com`;驗證線上內容只能用 `raw.githubusercontent.com` | LOCKED
- E5 | 只有 Cowork 雲端容器能跑 VOICEVOX engine;「在使用者電腦」模式的沙盒不行(下載不了 1.7GB、bash 無法常駐) | LOCKED

## 陷阱(T)
- T0 | **device_bash 沒有刪檔權限**(下面幾個陷阱的根源)— 只在 Cowork 底下成立;**本機 Claude Code 可以直接刪** | ACTIVE
- T1 | git 刪不掉自己建的 `.lock`,第二個 raw git 指令必爆。**一律用 `g`**,它會前後自動清 | LOCKED
- T2 | **絕不 `git checkout` 切分支** — 切走時 git 刪不掉舊分支才有的檔案,會留成 untracked,之後 merge 直接 Aborting。上線用 `publish`(commit-tree),不動工作目錄 | LOCKED
- T3 | CRLF 讓檔案看起來全被改過,判斷差異一律加 `--ignore-cr-at-eol`(只有 diff 有這個選項,status 沒有) | LOCKED
- T4 | HTML 是超長單行,`git diff --stat` 會爆 token,用 `--numstat` | LOCKED
- T5 | **絕不**在 `.wrap` / `#panel-vocab` 加 `overflow-x:auto`,會讓 sticky 表頭位移約 192px | LOCKED
- T6 | `device_stage_files` 遇同名舊檔不覆蓋,先 rm 再 stage 並核對 bytes/mtime | LOCKED
- T7 | 語音包的 clip id = `md5(speaker|text)` 前 12 碼、vvNorm 正規化前後端必須一致 — 對不上會靜默失敗(音檔存在但查不到) | LOCKED
- T8 | **兩個檔的波浪號不同**:`minna-notes` 用 `～`(U+FF5E)、`n5-vocab` 用 `〜`(U+301C)。n5-vocab 的 vvNorm 兩個都要剝,合成端與前端必須同一套規則 | LOCKED

- T9 | 小抽考(vq/aq/vb/av)的自動發音必須走 `aqAutoSpeak` 閘門 —— 直接在 render 裡 speak 會讓**切課切分頁時突然播音檔**(2026-08-22 修) | LOCKED

- T10 | 題目**在 build 時展開**,不要在前端即時組句 —— 即時組的句子不在 HTML 裡,`export_missing_clips.py` 掃不到就會缺音檔(時間/數字小考、朗讀都踩過) | LOCKED
- T11 | 產生日文例句時動詞要分類:瞬間動作配「○時に」、持續動作配「から/まで」,否則會生出「毎日 6時に 飲みます」這種句子 | LOCKED

- D14 | 課程內容一動,總學習要連帶更新;哪些自動、哪些要重跑產生器 -> CLAUDE.md「課程更新的連帶工作」 | LOCKED
- T12 | 朗讀總表(第99套)**不要另寫一套樣板** —— 舊做法讓它與各課朗讀各自演化(各課修好的 bug 它還留著)。現在是混合各課現成內容,音檔與涵蓋率自動成立 | LOCKED

- T13 | HTML 裡的 `rtmpl1..5`／`buildReading1..4` 是**死碼**(從沒被呼叫);朗讀的唯一來源是 `gen_reading.py` 產進 vv-data.reading | LOCKED
- T14 | `sayForceKana` 只能有一份(HTML 的 JS);工具端要**解析 HTML** 而不是自己硬編碼,否則新加的字會被拿漢字去合成(1日→唸成「いちにち」) | LOCKED

- T15 | 發音是**各面板各自綁 `.gspk` click**(文法/動詞/文法總表/測驗/助詞)。新增面板一定要補綁,否則 data-say 與音檔都在卻沒反應 | LOCKED
- T16 | 驗證新面板要**用 Playwright 真的點按鈕、計數 `speak()`**;只查 `vvClip` 查不查得到音檔會漏掉「漏綁事件」這類 bug | LOCKED
- T17 | 產生例句時**時間詞必須跟動詞時態配對**(昨日→ました、明日→ます),不能放同一個槽 | LOCKED

## 指標(P)
- P1 | 語音包重建管線與 vv-data 結構 -> `docs\語音包工具\README.md` + 專案記憶 `tts.md` | ACTIVE
- P2 | 追蹤系統本身怎麼用 -> 專案記憶 `context-system.md` | ACTIVE
