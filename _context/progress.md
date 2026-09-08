# Progress: 日文學習 — current status

> Purpose:前瞻性快照 —「現在進行到哪?」
> Update when:狀態/階段改變、任務完成、優先序變動。原地 OVERWRITE — 是快照不是日誌。
> BUDGET:~120 行。區塊固定(如下)。禁止帶日期的「Prior…/Earlier…」歷史區塊。
> Single source:歷史進 journal.md、耐久事實進 reference.md;這裡只放指標。

## Now
- 檔案配置:**整個專案資料夾就是 git repo**(2026-09-08 合併,F17);網站檔全在 `docs\`(Pages = main /docs),CLAUDE.md、_context/ 也在 git 裡,Windows／Mac 兩台靠 git 同步。
- git:**直接在 main 上做、不開分支**;**開工先 `git pull`**(另一台可能推過)。repo 合併步驟見 journal 2026-09-08。
- 筆記內容:第1課〜第12課架構,**L1〜L5 完整**(單字/文法/小考/朗讀/測驗)+數字/量詞/時間表。
- **五十音已獨立成 `kana.html`(2.0MB,2026-08-22)**,首頁第一張卡;minna-notes 因此瘦成 16.27MB。
- `n5-vocab.html`:**892 字**,全面改用 VOICEVOX 冥鳴ひまり(14)預錄音檔(1725 clips,6.8MB),
  音調圖已移除。是第二個「有內嵌音檔」的檔案。
- 語音包:minna-notes say 1959 / audio 5876 clips(檔案 **26.16MB** — 音檔外置該做了);kana.html say 393 / audio 1179 clips。
- 總學習分頁:單字總表／文法總表／動詞總表(11 動詞×4 變化＋44 題小抽考)／朗讀總表／測驗。
- 四個單字/動詞小抽考:中→日／日→中／只聽發音／聽寫打字(收假名或漢字)。
- **文法小考**:題庫 **315 題**(33/42/37/93/110)涵蓋 37 個文法點;兩種模式(看中文→說日文／只聽發音)。
- 第5課多一個「助詞」分頁(名詞＋助詞＋動詞,9 個助詞 15 列)。
- 測驗題數:第1課8／第2課9／第3課7／第4課18;總學習測驗 30 題(10 文法＋20 單字),選項會洗牌。
- **本機音檔管線已接通**:補音檔一行 `python docs\語音包工具\本機補音檔.py`,
  驗證 `node …\test_voice_full.mjs`(24 項全 PASS)。環境與陷阱見 _context/toolchain.md。
- 聲音仍是三個(Chloe/Uncle Ben/Darren);加第四個的成本見 toolchain.md,已評估過不划算。

## Next (1–3)
- MacBook:`git clone git@github.com:RobinYBWang/japanese-notes.git`(不要放 iCloud),之後照 toolchain.md §6。
- **音檔外置**(建議先做,見 todo):24.24MB 裡約 23.8MB 是內嵌音檔,每加一課還會再漲。
- 第6課起依課本進度建置(單字→文法→小考→朗讀→測驗,照 CLAUDE.md「課程更新的連帶工作」)。
- 確認 Pages 上線正常(五十音新頁、動詞總表;Ctrl+F5 或無痕)。
- 「測驗」分頁出題品質的五個問題,使用者還在想要不要動(見 todo)。

## Blockers
- 無。

## Pointers
- 2026-08-22 -> journal.md(搬到本機、音檔管線、Emily 放棄、_to_delete 清空、五十音獨立成頁、動詞總表、git 改 main 直做)。
- 2026-08-21 -> journal.md(初始化、母版廢除、git 流程建立、n5-vocab 總整理)。
- git 三條鐵律與日常節奏 -> CLAUDE.md「Git 流程」一節。
- 語音包操作 -> docs\語音包工具\README.md。
