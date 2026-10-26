// n4-mock-easy.html 回歸測試（由 test_mock.mjs 改來）：題庫結構、配額（正式 N4 各大題的一半）、音檔覆蓋、固定考卷、
// 三科依序作答、180 分制計分、歷史紀錄（看詳解／重考／清空／作廢）、Google Analytics 自訂事件、N4 漢字程度、版面
// 用法：node test_n4mock.mjs [要驗的 html，預設 ..\n4-mock-easy.html]
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(process.argv[2] || path.join(HERE, '..', 'n4-mock-easy.html'));
const N = 45;                       // 每份題數：15 + 15 + 15
const NP = 5;                       // 目前做好的回數（n4_bank.py 每做好一回就 +1）
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('dialog', d => d.accept());   // 「還有 N 題沒作答」的 confirm 一律接受
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
// GA 只在 github.io 上載入；這裡先放一個假的 gtag 把送出的事件記下來
await page.addInitScript(() => { window.__ga = []; window.gtag = function(){ window.__ga.push([].slice.call(arguments)); }; });
console.log('驗證：' + HTML);
await page.goto(pathToFileURL(HTML).href, { timeout: 90000 });
await page.waitForTimeout(800);

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

ok('標題', (await page.title()).includes('N4'));

// 題庫本身：每題結構、讀解成組、配額表對得上題型、每題型夠抽 5 份、聴解音檔全覆蓋
const info = await page.evaluate(() => {
  const types = {};
  BANK.forEach(q => { const k = q.sec + '|' + q.type; types[k] = (types[k] || 0) + 1; });
  const bad = [];
  const seenQ = new Set();
  BANK.forEach((q, i) => {
    if (!(q.c.length === 3 || q.c.length === 4)) bad.push(i + ' 選項數');
    if (!(q.a >= 0 && q.a < q.c.length)) bad.push(i + ' 正解索引');
    if (new Set(q.c).size !== q.c.length) bad.push(i + ' 選項重複');
    if (!q.e) bad.push(i + ' 沒解說');
    if (q.sec === 3 && !q.audio) bad.push(i + ' 聴解沒音檔');
    if (q.audio && q.audio.some(l => !['F', 'M', 'N'].includes(l.r))) bad.push(i + ' 角色');
    if (q.type.indexOf('★') >= 0 && !(q.q.includes('class="star"') && q.c.length === 4)) bad.push(i + ' 組み立て格式');
    if (!LABEL[q.sec + '|' + q.type.split('　')[0]]) bad.push(i + ' 沒有 LABEL');
    const k = keyOf(q);
    if (seenQ.has(k)) bad.push(i + ' 題目重複（keyOf 撞號）');
    seenQ.add(k);
  });
  // 同一篇的題要連續，篇數與每篇題數依題型：文章文法 2、中文 2、短文 1、情報検索 1
  const groups = [];
  BANK.forEach(q => {
    if (!q.pass) return;
    const last = groups[groups.length - 1];
    if (last && last.pass === q.pass && last.type === q.type) last.n++;
    else groups.push({ pass: q.pass, type: q.type, n: 1 });
  });
  const want = { '問題3': 2, '問題4': 1, '問題5': 2, '問題6': 1 };
  const passOk = groups.every(g => g.n === want[g.type.split('　')[0]]) &&
                 new Set(groups.map(g => g.pass)).size === groups.length;
  // 每科的題型要照 問題1→N 的順序排
  let orderOk = true, prev = null;
  BANK.forEach(q => { const k = [q.sec, +q.type.match(/問題(\d+)/)[1]]; if (prev && (k[0] < prev[0] || (k[0] === prev[0] && k[1] < prev[1]))) orderOk = false; prev = k; });
  const quotaOk = Object.keys(types).every(k => QUOTA[k] > 0) && Object.keys(QUOTA).every(k => types[k] > 0);
  const quotaTotal = Object.values(QUOTA).reduce((a, b) => a + b, 0);
  const enough = Object.keys(QUOTA).every(k => types[k] >= QUOTA[k] * NPAPER);
  const uncovered = BANK.filter(q => q.audio && !vvCover(q)).length;
  // 選項洗牌後也要有音檔（2026-09-12：以前「1ばん。選項」整句合成，洗牌後就退回瀏覽器語音）
  const uncoveredDrawn = PAPERS.flat().map(shuffleChoices).filter(q => q.audio && !vvCover(q)).length;
  return { n: BANK.length, types, bad, passOk, orderOk, quotaOk, quotaTotal, enough, uncovered, uncoveredDrawn, hasAll: VV_HAS_ALL,
           clips: Object.keys(VV.audio).length, texts: Object.keys(VV.say).length };
});
ok('題庫 ' + N * NP + ' 題', info.n === N * NP);
ok('每題結構正確', info.bad.length === 0);
ok('讀解／文章文法每篇題數正確、短文不重複', info.passOk);
ok('題庫依 科目→問題N 排序', info.orderOk);
ok('配額表 15 個題型一一對應、合計 ' + N, info.quotaOk && info.quotaTotal === N && Object.keys(info.types).length === 15);
ok('每個題型都夠出 NPAPER 回', info.enough);
ok('聴解音檔全覆蓋（含題目旁白與選項朗讀）', info.uncovered === 0 && info.hasAll);
ok('每回考卷（選項重排後）音檔也全覆蓋', info.uncoveredDrawn === 0);

// 漢字程度：題目、選項、文章、聴解台詞只能出現 N4 漢字（n4_level.py：N5＋N4）；表記題（文字語彙 問題2）只看正解
const KJ = execFileSync('python3', ['-c', 'from n4_level import N4_KANJI; print("".join(sorted(N4_KANJI)))'], { cwd: HERE, encoding: 'utf8' }).trim();
const overKanji = await page.evaluate(kj => {
  const bad = [];
  for (const q of BANK) {
    const hyouki = q.sec === 1 && q.type.startsWith('問題2');
    const fs = [q.q, q.pass || ''].concat(hyouki ? [q.c[q.a]] : q.c, (q.audio || []).map(l => l.t));
    const k = fs.join(' ').replace(/<[^>]+>/g, '').match(/[一-龥々]/g) || [];
    const out = k.filter(c => !kj.includes(c));
    if (out.length) bad.push(out.join('') + '：' + q.q.replace(/<[^>]+>/g, '').slice(0, 20));
  }
  return bad;
}, KJ);
ok('只用到 N4 漢字（表外的詞寫平假名）', overKanji.length === 0);
if (overKanji.length) console.log('表外漢字：', overKanji.slice(0, 6));

// 圖片：14 題四格圖（選項 1〜4、固定順序）、15 題發話表現有場景圖，圖檔都載得進來
const pics = await page.evaluate(() => new Promise(res => {
  const four = BANK.filter(q => q.img);
  const scenes = BANK.filter(q => q.scene && q.scene.img);
  const fourOk = four.every(q => q.fixed && q.c.join() === '1,2,3,4' && q.a >= 0 && q.a < 4);
  const srcs = [...new Set(four.map(q => q.img).concat(scenes.map(q => q.scene.img)))];
  let left = srcs.length, bad = [];
  if (!left) return res({ four: four.length, scenes: scenes.length, fourOk, bad: ['no images'] });
  srcs.forEach(s => {
    const im = new Image();
    im.onload = () => { if (im.naturalWidth < 200) bad.push(s); if (!--left) res({ four: four.length, scenes: scenes.length, fourOk, bad }); };
    im.onerror = () => { bad.push(s); if (!--left) res({ four: four.length, scenes: scenes.length, fourOk, bad }); };
    im.src = s;
  });
}));
ok('四格圖片題每回 4 題：選項 1〜4、固定順序', pics.four === 4 * NP && pics.fourOk);
ok('發話表現每回 3 題、都有場景圖', pics.scenes === 3 * NP);
ok(7 * NP + ' 張圖都載得進來、寬度夠', pics.bad.length === 0);
if (pics.bad.length) console.log('壞圖:', pics.bad);

// 固定考卷：每回 45 題、合配額、回與回之間題目不重複、選項順序固定、正解位置分散
const pp = await page.evaluate(() => {
  const keys = PAPERS.flat().map(keyOf);
  const quotaOk = PAPERS.every(ps => { const t = {}; ps.forEach(q => { const k = q.sec + '|' + q.type; t[k] = (t[k] || 0) + 1; });
                                         return Object.keys(QUOTA).every(k => t[k] === QUOTA[k]); });
  const fixedOk = PAPERS.every(ps => ps.map(shuffleChoices).map(q => q.c.join('|')).join() === ps.map(shuffleChoices).map(q => q.c.join('|')).join());
  const pos = [0, 0, 0, 0]; let n4 = 0;
  PAPERS.flat().forEach(q => { if (q.fixed || q.c.length !== 4) return; pos[shuffleChoices(q).a]++; n4++; });
  return { n: PAPERS.length, sizes: PAPERS.map(ps => ps.length), uniq: new Set(keys).size === keys.length, quotaOk, fixedOk,
           posMin: Math.min.apply(null, pos) / n4, cards: document.querySelectorAll('#papers .paper').length };
});
ok(NP + ' 回考卷、每回 ' + N + ' 題、選卷頁 ' + NP + ' 張卡', pp.n === NP && pp.sizes.every(n => n === N) && pp.cards === NP);
ok('每回都符合配額、回與回之間題目不重複', pp.quotaOk && pp.uniq);
ok('選項順序固定（同一回打開兩次一樣）', pp.fixedOk);
ok('四選一的正解位置分散（每個位置至少 15%）', pp.posMin >= 0.15);

// 考第 1 回：三科 15/15/15、各題型合配額、讀解四篇各顯示一次、只有第一科能作答
await page.evaluate(() => localStorage.clear());
await page.click('[data-start="0"]');
await page.waitForTimeout(500);
const ex1 = await page.evaluate(() => {
  const sec = {}, types = {};
  qs.forEach(q => { sec[q.sec] = (sec[q.sec] || 0) + 1; const k = q.sec + '|' + q.type; types[k] = (types[k] || 0) + 1; });
  return { keys: qs.map(keyOf), choices: qs.map(q => q.c.join('|')), sec, types,
           cards: document.querySelectorAll('#quiz .card').length,
           passages: document.querySelectorAll('#quiz .passage').length,
           quotaMatch: Object.keys(QUOTA).every(k => types[k] === QUOTA[k]),
           left, btn: $('submit').textContent, running: localStorage.getItem('jp_n4mock_running'),
           locked: document.querySelectorAll('#tabs .tab.lock').length };
});
ok('第 1 回 ' + N + ' 題、就是 PAPERS[0]', ex1.keys.length === N && ex1.cards === N && await page.evaluate(k => PAPERS[0].map(keyOf).join() === k.join(), ex1.keys));
ok('三科 15／15／15', ex1.sec[1] === 15 && ex1.sec[2] === 15 && ex1.sec[3] === 15);
ok('各題型符合配額', ex1.quotaMatch);
ok('讀解四篇（文章文法／短文／中文／情報検索）各顯示一次', ex1.passages === 4);
ok('第一科：計時 13:00、按鈕是「下一科」、另外兩科鎖住', ex1.left >= 13 * 60 - 2 && ex1.btn.indexOf('下一科') === 0 && ex1.locked === 2);
ok('考試中記下「正在考第 1 回」（離開會作廢）', ex1.running === '0');

// 鎖住的分頁點了不會切
await page.click('#tabs .tab[data-sec="3"]');
await page.waitForTimeout(200);
ok('點鎖住的分頁不會切換', await page.evaluate(() => !document.querySelector('.pane[data-sec="1"]').classList.contains('hide')));

// 全部選第一個選項，依序交三科
await page.evaluate(() => { document.querySelectorAll('#quiz .card').forEach(c => c.querySelector('.ch').click()); });
await page.click('#submit');
await page.waitForTimeout(300);
// 計時器每秒跳一次，檢查時允許差 1〜2 秒
const s2 = await page.evaluate(() => ({ cur, left, pane2: !document.querySelector('.pane[data-sec="2"]').classList.contains('hide'),
                                        lock1: document.querySelector('#tabs .tab[data-sec="1"]').classList.contains('lock') }));
ok('下一科：進入文法讀解、計時重設 28:00、第一科鎖住', s2.cur === 2 && s2.left >= 28 * 60 - 2 && s2.pane2 && s2.lock1);
await page.click('#submit');
await page.waitForTimeout(300);
const s3 = await page.evaluate(() => ({ cur, left, btn: $('submit').textContent }));
ok('進入聴解：計時 18:00、按鈕變成「交卷」', s3.cur === 3 && s3.left >= 18 * 60 - 2 && s3.btn === '交卷');

// 聴解畫面：發話表現／即時応答的選項文字作答中看不到；圖片題有圖、選項是 1〜4
const hid = await page.evaluate(() => {
  const span = document.querySelector('.pane[data-sec="3"] .choices.row.hid .ch > span:last-child');
  const img = document.querySelector('.pane[data-sec="3"] img.qimg, .pane[data-sec="3"] .scene img, .pane[data-sec="3"] .scene .emo');
  return { hidden: span && getComputedStyle(span).display === 'none', hasImg: !!img, hidCards: document.querySelectorAll('.pane[data-sec="3"] .choices.row.hid').length };
});
ok('作答中發話表現／即時応答的選項只唸不顯示（7 題）', hid.hidden && hid.hidCards === 7);
ok('聴解畫面有場景提示（圖片或 emoji）', hid.hasImg);

// 播放一題聴解不噴錯
await page.click('#quiz .pane[data-sec="3"] .play');
await page.waitForTimeout(800);
await page.evaluate(() => stopPlay());
ok('點播放不噴錯', errors.length === 0);

// 交卷：180 分制、合格判定、15 個大題的答對數、寫進第 1 回的歷史紀錄
await page.click('#submit');
await page.waitForTimeout(500);
const res = await page.evaluate(() => ({
  score: ($('result').querySelector('.score') || {}).textContent || '',
  text: $('result').textContent || '',
  rows: $('result').querySelectorAll('.brkdown tr').length,
  hist: JSON.parse(localStorage.getItem('jp_n4mock_hist_0') || '[]'),
  running: localStorage.getItem('jp_n4mock_running'),
  locked: document.querySelectorAll('#tabs .tab.lock').length,
  choiceShown: getComputedStyle(document.querySelector('.choices.row.hid .ch > span:last-child')).display !== 'none',
}));
ok('交卷：成績是 180 分制、標示第 1 回', /\d+ \/ 180/.test(res.score) && res.text.includes('/ 120') && res.text.includes('/ 60') && res.text.includes('第 1 回'));
ok('交卷後只唸不顯示的選項文字出現', res.choiceShown);
ok('交卷：有合格判定與 15 個大題的答對數', /合格/.test(res.text) && res.rows === 15 && res.locked === 0);
ok('交卷：第 1 回歷史紀錄 1 筆（分數與畫面一致）、不再標示考試中', res.hist.length === 1 && res.score.indexOf(String(res.hist[0].total)) === 0 && res.running === null);

// 回選卷頁：第 1 回顯示考過 1 次、最佳分數、歷史紀錄一列
await page.click('#home');
await page.waitForTimeout(300);
const home = await page.evaluate(() => {
  const c = document.querySelectorAll('#papers .paper')[0];
  return { text: c.textContent, rows: c.querySelectorAll('.hist tr').length, review: !!c.querySelector('[data-review="0:0"]'),
           btn: c.querySelector('[data-start]').textContent, others: (document.querySelectorAll('#papers .paper')[1] || {}).textContent };
});
ok('選卷頁：第 1 回顯示考過 1 次、最佳分數、按鈕變「重考」', /考過 1 次/.test(home.text) && /最佳 \d+ \/ 180/.test(home.text) && home.btn === '重考');
ok('選卷頁：第 1 回歷史紀錄一列、有「看詳解」；第 2 回還沒考過', home.rows === 1 && home.review && (NP < 2 || /還沒考過/.test(home.others)));

// 看詳解：45 題已批改、錯題標紅數量與作答一致、題目與交卷時那份相同
await page.evaluate(() => document.querySelectorAll('#papers details').forEach(d => { d.open = true; }));
await page.click('[data-review="0:0"]');
await page.waitForTimeout(400);
const rv = await page.evaluate(() => ({
  shown: $('quiz').classList.contains('done') && !$('quiz').classList.contains('hide') && $('start').classList.contains('hide'),
  cards: document.querySelectorAll('#quiz .card').length,
  marks: document.querySelectorAll('#quiz .mark.ok, #quiz .mark.ng').length,
  ans: document.querySelectorAll('#quiz .ch.ans').length,
  wrong: document.querySelectorAll('#quiz .ch.wrong').length,
  wrongExpected: picked.filter((p, i) => p !== null && p !== qs[i].a).length,
  title: ($('result').textContent || '').includes('📂'),
  score: ($('result').querySelector('.score') || {}).textContent || '',
  keys: qs.map(keyOf),
}));
ok('看詳解：' + N + ' 題已批改、進入交卷後狀態', rv.shown && rv.cards === N && rv.marks === N && rv.ans === N);
ok('看詳解：錯題標紅與作答一致、成績卡有日期與分數', rv.wrong === rv.wrongExpected && rv.title && /\d+ \/ 180/.test(rv.score));
ok('看詳解的題目與交卷時那份相同', rv.keys.join() === ex1.keys.join());

// 重考這一回：題目、選項順序都跟第一次一樣
await page.click('#again');
await page.waitForTimeout(500);
const ex2 = await page.evaluate(() => ({ keys: qs.map(keyOf), choices: qs.map(q => q.c.join('|')), submitted, running: localStorage.getItem('jp_n4mock_running') }));
ok('重考這一回：題目與選項順序完全相同、重新開始作答', ex2.keys.join() === ex1.keys.join() && ex2.choices.join() === ex1.choices.join() && !ex2.submitted && ex2.running === '0');

// 考到一半重新整理 → 那一次作廢（跟正式版一樣）
await page.reload();
await page.waitForTimeout(1200);
const ab = await page.evaluate(() => ({ msg: $('msg').textContent, hist: JSON.parse(localStorage.getItem('jp_n4mock_hist_0') || '[]') }));
ok('考到一半離開：選卷頁提示作廢、歷史紀錄多一筆「作廢」', /作廢/.test(ab.msg) && ab.hist.length === 2 && ab.hist[0].void === true);
ok('作廢那筆顯示「未完成（作廢）」、不算進考過次數', await page.evaluate(() => {
  const c = document.querySelectorAll('#papers .paper')[0];
  return /未完成（作廢）/.test(c.textContent) && /考過 1 次/.test(c.textContent);
}));

// Google Analytics 自訂事件（重新整理後 __ga 清空，作廢事件在新頁面；前面的事件在舊頁面已經送出，另外檢查）
const ga2 = await page.evaluate(() => window.__ga.filter(a => a[0] === 'event').map(a => a[1] + ':' + a[2].exam_type + ':' + a[2].paper));
ok('GA：作廢送出 exam_abandon（n4easy／第 1 回）', ga2.includes('exam_abandon:n4easy:第 1 回'));

// 清空這一回的紀錄
await page.evaluate(() => { document.querySelector('#papers .paper details').open = true; });
await page.click('[data-clear="0"]');
await page.waitForTimeout(300);
const cl = await page.evaluate(() => ({ hist: localStorage.getItem('jp_n4mock_hist_0'), msg: $('msg').textContent,
                                       ga: window.__ga.filter(a => a[0] === 'event').map(a => a[1]) }));
ok('清空這一回的紀錄：紀錄刪掉、有提示、送出 history_clear', cl.hist === null && /清空/.test(cl.msg) && cl.ga.includes('history_clear'));

// 第 2 回（只有一回時用第 1 回）：開始 → 下一科 → 交卷，一路檢查送出的事件
const P2 = NP >= 2 ? 1 : 0, P2N = '第 ' + (P2 + 1) + ' 回';
await page.evaluate(() => { window.__ga = []; });
await page.click('[data-start="' + P2 + '"]');
await page.waitForTimeout(400);
await page.click('#submit'); await page.waitForTimeout(200);
await page.click('#submit'); await page.waitForTimeout(200);
await page.click('#submit'); await page.waitForTimeout(400);
await page.click('#home'); await page.waitForTimeout(200);
await page.evaluate(() => document.querySelectorAll('#papers details').forEach(d => { d.open = true; })); await page.click('[data-review="' + P2 + ':0"]'); await page.waitForTimeout(300);
const ga = await page.evaluate(() => window.__ga.filter(a => a[0] === 'event').map(a => [a[1], a[2]]));
const ev = n => ga.filter(e => e[0] === n);
ok('GA：exam_start（n4easy、' + P2N + '、第 1 次、計時 on）', ev('exam_start').length === 1 && ev('exam_start')[0][1].exam_type === 'n4easy' &&
   ev('exam_start')[0][1].paper === P2N && ev('exam_start')[0][1].attempt === 1 && ev('exam_start')[0][1].timer === 'on');
ok('GA：exam_section 兩次（文法・読解、聴解）', ev('exam_section').map(e => e[1].section).join() === '文法・読解,聴解');
ok('GA：exam_finish 帶分數與合格與否', ev('exam_finish').length === 1 && typeof ev('exam_finish')[0][1].score === 'number' && /^(yes|no)$/.test(ev('exam_finish')[0][1].passed));
ok('GA：看詳解送出 exam_review', ev('exam_review').length === 1 && ev('exam_review')[0][1].paper === P2N);
await page.click('#home'); await page.waitForTimeout(200);
await page.click('[data-start="' + P2 + '"]'); await page.waitForTimeout(300);

// 音檔真的能解碼
const played = await page.evaluate(() => new Promise(res => {
  const q = BANK.filter(q => q.audio).pop();
  const id = vvId(q.audio[0].r, q.audio[0].t);
  if (!id) return res(false);
  const a = new Audio('data:audio/ogg;base64,' + VV.audio[id]);
  a.addEventListener('loadedmetadata', () => res(a.duration > 0.1));
  a.addEventListener('error', () => res(false));
}));
ok('音檔可解碼', played);

// 版面：各寬度不得橫向溢出（第二科含表格的情報検索也要看）
await page.click('#submit');
await page.waitForTimeout(200);
const over = [];
for (const w of [320, 390, 768, 1280]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.waitForTimeout(150);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > w) over.push(w + ':' + sw);
}
ok('320/390/768/1280 無橫向溢出', over.length === 0);

ok('無 console 錯誤', errors.length === 0);

let fail = 0;
for (const [n, c] of checks) { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; }
if (info.bad.length) console.log('壞題樣本:', info.bad.slice(0, 6));
if (over.length) console.log('溢出:', over);
if (errors.length) console.log('errors:', errors.slice(0, 6));
console.log('bank ' + info.n + ' / clips ' + info.clips + ' / texts ' + info.texts + ' / 未覆蓋 ' + info.uncovered);
await browser.close();
process.exit(fail ? 1 : 0);
