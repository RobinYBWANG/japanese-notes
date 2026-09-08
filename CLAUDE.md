# Project: 日文學習 — Cascading Context(模式三/原生 Projects 版)

本 project 的定位:維護《大家的日本語》初級筆記,並發佈到 GitHub Pages https://robinybwang.github.io/japanese-notes/
Stack / 工具:單檔 HTML(minna-notes.html 約 28MB,內嵌 VOICEVOX 音檔)、VOICEVOX 語音包(docs\語音包工具\)、GitHub Pages、Playwright 驗證
慣例:繁體中文、回答簡短、用純文字提問(不用選項卡);**母版制度已於 2026-08-21 廢除**,所有檔案只有一份、網站檔都在 `docs\`;**2026-09-08 起整個專案資料夾就是 git repo**(CLAUDE.md、_context/ 也在 git 裡,Windows／Mac 兩台靠 git 同步);**課程內容一動,總學習那邊要一起更新**(見下節);**commit 一律等使用者說「可以」才做**(他要先自己開檔看過;
覆蓋本機檔案則不用問)、push 一律使用者自己按;新增或修改任何內容後順手跑一次「整理筆記」skill 並補產對應音檔

## 課程更新的連帶工作(2026-08-23 定案)

**只要動到任何一課的內容 —— 單字、動詞、文法、朗讀、測驗 —— 都要讓「總學習」跟著更新。**
總學習有五個分頁:單字總表／文法總表／動詞總表／朗讀總表／測驗,外加文法總表上方的小考。

會自動跟上的(前端即時算,不用做事):
- 單字總表、動詞總表、文法總表
- 各課測驗與總學習測驗的題目池(直接讀 workbook 與 QUIZ_GRAMMAR)

**不會自動跟上,一定要重跑產生器**:
| 動到什麼 | 要跑什麼 |
|---|---|
| 單字/詞性/文法點 | `docs\語音包工具\gen_grammar_quiz.py` — 重產文法小考題庫(各課小考與文法總表小考共用) |
| 該課朗讀 | `docs\語音包工具\gen_reading.py <課號>` — 重產朗讀套組(JS 樣板也要同步改) |
| 以上任何一項 | `docs\語音包工具\本機補音檔.py` — 補新句子的音檔 |
| 測驗題 | 手改 `QUIZ_GRAMMAR[n]`;新增課次記得**該課要有題**(第2課曾經 0 題) |

最後跑驗證:`test_voice_full.mjs`(minna)、`test_kana.mjs`(kana)、`test_autoplay.mjs`。

## Folder map(本層)
- ./_context/     context 檔(依下方 load policy 載入)
- ./input/        唯讀投放區(我丟檔案,你分析)
- ./output/       你產出的交付物(_vN 版本化)
- ./docs/         **GitHub Pages 發布來源(main /docs)**,所有筆記頁面與工具都在這裡,不歸 input/output 管。
- (整個專案資料夾 = git repo `RobinYBWang/japanese-notes`;`output/ input/ _to_delete/` 在 .gitignore,不上 git。)
- ./_to_delete/   待刪暫存區。**2026-08-22 起本機可直接刪檔**,這裡只放「不確定要不要留」的東西。

## Context load policy — 每個新 task 開始時
1. 讀 ./_context/*.md(always-load:progress.md、todo.md、reference.md、about-me.md、
   toolchain.md)。toolchain.md 是實作手冊 — 環境能力、改檔陷阱、驗證清單,動 docs\ 裡
   任何檔案之前必讀。
2. 不要先讀 ./_context/on-demand/*.md — 觸發才載入:
   - journal.md -> 只在需要歷史/決策脈絡時 READ(「當初為什麼…」)。
     有實質工作後仍要 APPEND(見 pipeline)。
   - notes.md(如存在)-> 只在接續未完工作時 READ。session 開始時它應近乎全空;
     不是的話 = 上次沒 wrap,先 drain。
3. writing-style 與 coding-rules 是帳號層級的 Skills,自動觸發,不放本資料夾。
4. BUDGET CHECK:載入 always-load 檔時檢查行數。超過 budget(progress ~120 行、
   todo Inbox ~60 行、reference ~250 行、toolchain ~200 行)必須明講,並建議先 compact / session-wrap
   再開工。不要默默載入肥大檔案。
5. 簡短回報載入了什麼(並標出超標檔案)。

## 追蹤檔與晉升 pipeline
- todo.md      點子收件匣。自由捕捉;加/勾/刪。        Budget:Inbox ~60 行。
- progress.md  現況快照+下一步。原地 OVERWRITE。       Budget:~120 行。
- journal.md   append-only 歷史+理由(+commit hash)。   Budget:無(on-demand)。
- reference.md 少變動的耐久事實(durable-facts sink)。  Budget:~250 行。
- toolchain.md  實作 know-how(環境/改檔/驗證/踩過的坑)。 Budget:~200 行。
- notes.md     選用的排空式草稿區(in-progress 工作記憶)。Budget:~40 行。

Pipeline:idea -> todo.md --(確認)--> progress.md --(完成/commit)--> journal.md
- 新點子/問題/不急的事 -> todo.md。
- 成為確認任務 -> 移到 progress.md。
- 完成或 commit -> journal.md APPEND 一筆帶日期的紀錄,更新 progress.md,
  todo 該項收成一行+journal 指標移進 Archive。

SINGLE SOURCE OF TRUTH:
- 每個事實只有一個家:歷史/理由 -> journal.md;耐久事實 -> reference.md。
- progress.md 與 todo.md 只能放指標(日期或 ID+一行),絕不複製內文。
- 發現自己在「詳見 journal…」旁邊又貼了全文 -> 刪掉副本。

SIZE BUDGETS:
- budget 如上表;journal.md 設計上不設限(append-only 終端 sink)。
- 檔案超標時,必須先 compact 才能繼續工作:溢出內容路由回正確的家
  (journal/reference)再修剪。

SESSION-WRAP ritual — 有實質工作的 session 結束前執行(任何表達結束/歸檔語意的話
都觸發,如「wrap up」「收工」「今天到這」);偵測到工作告一段落也要主動提醒我:
  1. journal.md APPEND 本次工作紀錄(what/why/outcome + commit hash)。
  2. progress.md 剪回固定骨架 — 歷史此刻已在 journal 裡。
  3. resolved todo 收成一行+journal 日期指標,移進 Archive。
  4. Drain notes.md(如存在):每項路由到 todo/progress/journal/reference 或刪除。
  5. Budget check:所有 always-load 檔回到 budget 內。

寫入路由:
- 未來意圖 -> todo.md
- 現況(會變)-> progress.md(overwrite;固定骨架,禁止帶日期的歷史區塊)
- 過去事件/決策+理由 -> journal.md(append)
- 少變動的耐久事實 -> reference.md
- 必須活過本 session 的半成品思路 -> notes.md(wrap 時排空)
寫入追蹤檔時簡短說一聲,如「(noted to todo)」。

## input/
- 唯讀工作區。我丟檔,你依當前任務 ON DEMAND 讀取分析。
- 絕不在 input/ 內寫入、搬移、改名、刪除。可有子資料夾。
- session 開始不要自動讀 input/ — 它是工作區,不是 context。

## output/
- 產出的交付物寫這裡。
- 版本化:每個產出檔副檔名前加 _vN(如 proposal_v1.docx)。
  * 新交付物 -> _v1。
  * 修訂 -> 列出 output/,找同名最高 _vN,寫 _v(N+1)。
  * 除非我明說,絕不覆蓋或刪除舊版本。
- 布局:預設 FLAT。我建了子資料夾或要求分組時,該交付物的各版本放
  output/<name>/<name>_v1.ext、_v2.ext…。
- 例外:`docs\` 底下的檔案是既有工作檔,原地更新、走 git,不進 output/。

## Git 流程(repo = 整個專案資料夾;網站只發布 docs/)— 2026-08-22 改為本機直做

在本機 Claude Code 底下用**原生 git**就好(Cowork 時代的 `g` / `publish` 包裝是為了繞開
「device_bash 刪不掉 `.lock`」而生的,本機不需要;`工具\git-wrap.sh` 留著但不再使用)。

規則:

1. **直接在 `main` 上做,不開分支**(2026-08-22 使用者定案)。有特殊需求再開。
2. **commit 要等使用者說可以。** 做完先回報「已改好,沒 commit」然後停;他說可以時,
   先列出會進 commit 的檔案與行數再動手。
3. **push 也要他明講**才做(本機有網路做得到,但預設不主動推)。

日常節奏:

```
(開工先 git pull —— 另一台電腦可能推過)
編輯 docs\ 裡的檔案或 CLAUDE.md／_context → 驗證(test_voice_full.mjs / test_kana.mjs)
  → 回報改了什麼、沒 commit
  → 使用者說可以 → git add -- <檔案> ; git commit
  → 使用者說要上線 → git push origin main
```

- `git diff` 對 16MB 單行 HTML 會爆 token:用 `--numstat`,要看內容再
  `git diff … | grep -E '^[+-][^+-]' | cut -c1-150`。
- CRLF 會讓檔案看起來全被改過,判斷差異一律加 `--ignore-cr-at-eol`(diff 才有這個選項,
  status 沒有)。
- 舊的 `working` 分支還在本機(當還原點),要不要砍由使用者決定。

## Safety
未經確認絕不送出、發布或分享任何東西。優先給草稿。
**commit 要等我說「可以」**;做完內容只回報「已改好,沒 commit」然後停。
我說要 commit 時,先列出會進 commit 的檔案與行數再動手。
push 到 GitHub 永遠由使用者自己按(我只到 publish 為止)。
**刪檔**:本機有權限,可以直接刪。純垃圾(git 殘留、暫存、已 RETIRED 的東西)直接刪並回報;
有內容價值或不確定的,先列清單等確認,或先 mv 進 `_to_delete\`。
