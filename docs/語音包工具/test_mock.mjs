// n5-mock-easy.html 回歸測試：題庫結構、抽題配額、音檔覆蓋、交卷記錄、兩次抽題不重複、版面
// 用法：node test_mock.mjs [要驗的 html，預設 ..\n5-mock-easy.html]
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(process.argv[2] || path.join(HERE, '..', 'n5-mock-easy.html'));
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('dialog', d => d.accept());   // 「還有 N 題沒作答」的 confirm 一律接受
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
console.log('驗證：' + HTML);
await page.goto(pathToFileURL(HTML).href, { timeout: 90000 });
await page.waitForTimeout(800);

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

ok('標題', (await page.title()).includes('N5'));

// 題庫本身：每題結構、讀解成組、配額表對得上題型、聴解音檔全覆蓋
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
    const k = keyOf(q);
    if (seenQ.has(k)) bad.push(i + ' 題目重複（keyOf 撞號）');
    seenQ.add(k);
  });
  const passes = [];
  BANK.forEach(q => {
    if (!q.pass) return;
    if (passes.length && passes[passes.length - 1].pass === q.pass) passes[passes.length - 1].n++;
    else passes.push({ pass: q.pass, n: 1 });
  });
  const passOk = passes.every(p => p.n === 3) && new Set(passes.map(p => p.pass)).size === passes.length;
  const quotaOk = Object.keys(types).every(k => QUOTA[k] > 0) && Object.keys(QUOTA).every(k => types[k] > 0);
  const quotaTotal = Object.values(QUOTA).reduce((a, b) => a + b, 0);
  const enough = Object.keys(QUOTA).every(k => types[k] >= QUOTA[k] * 5);
  const uncovered = BANK.filter(q => q.audio && !vvCover(q)).length;
  return { n: BANK.length, bad, passOk, quotaOk, quotaTotal, enough, uncovered, hasAll: VV_HAS_ALL,
           clips: Object.keys(VV.audio).length, texts: Object.keys(VV.say).length };
});
ok('題庫 150 題', info.n === 150);
ok('每題結構正確', info.bad.length === 0);
ok('讀解每篇 3 題、短文不重複', info.passOk);
ok('配額表與題型一一對應、合計 30', info.quotaOk && info.quotaTotal === 30);
ok('每個題型夠抽 5 份', info.enough);
ok('聴解音檔全覆蓋（含選項朗讀）', info.uncovered === 0 && info.hasAll);

// 第一次考：抽 30 題、三科 8/10/12、各題型合配額、讀解只顯示一篇短文
await page.evaluate(() => localStorage.clear());
await page.click('#go');
await page.waitForTimeout(500);
const ex1 = await page.evaluate(() => {
  const sec = {}, types = {};
  qs.forEach(q => { sec[q.sec] = (sec[q.sec] || 0) + 1; const k = q.sec + '|' + q.type; types[k] = (types[k] || 0) + 1; });
  return { keys: qs.map(keyOf), sec, types,
           cards: document.querySelectorAll('#quiz .card').length,
           passages: document.querySelectorAll('#quiz .passage').length,
           quotaMatch: Object.keys(QUOTA).every(k => types[k] === QUOTA[k]) };
});
ok('抽 30 題', ex1.keys.length === 30 && ex1.cards === 30);
ok('三科 8／10／12', ex1.sec[1] === 8 && ex1.sec[2] === 10 && ex1.sec[3] === 12);
ok('各題型符合配額', ex1.quotaMatch);
ok('讀解一篇短文只顯示一次', ex1.passages === 1);

// 播放一題聴解不噴錯
await page.click('#tabs .tab[data-sec="3"]');
await page.click('#quiz .play');
await page.waitForTimeout(800);
await page.evaluate(() => stopPlay());
ok('點播放不噴錯', errors.length === 0);

// 全部選第一個選項後交卷：有分數、30 題記為考過
await page.evaluate(() => {
  document.querySelectorAll('#quiz .card').forEach(c => c.querySelector('.ch').click());
});
await page.click('#submit');
await page.waitForTimeout(500);
const res = await page.evaluate(() => ({
  score: (document.querySelector('.score') || {}).textContent || '',
  seen: JSON.parse(localStorage.getItem('jp_n5mock_seen') || '[]').length,
}));
ok('交卷有分數', /\d+ \/ 30/.test(res.score));
ok('交卷後記錄 30 題為考過', res.seen === 30);

// 再考一次：開始畫面顯示已考過、第二份與第一份完全不重複
await page.click('#again');
await page.waitForTimeout(300);
ok('開始畫面顯示已考過', (await page.textContent('#pool') || '').includes('已考過 30 題'));

// 上次考試結果：按鈕出現 → 回看時 30 題已批改、錯題標紅數量與作答一致、成績卡標示日期、題目與交卷時相同
const lastBtn = await page.evaluate(() => !$('last').classList.contains('hide') && !!localStorage.getItem('jp_n5mock_last'));
ok('交卷後開始畫面有「上次考試結果」', lastBtn);
await page.click('#last');
await page.waitForTimeout(400);
const rv = await page.evaluate(() => ({
  shown: $('quiz').classList.contains('done') && !$('quiz').classList.contains('hide') && $('start').classList.contains('hide'),
  cards: document.querySelectorAll('#quiz .card').length,
  marks: document.querySelectorAll('#quiz .mark.ok, #quiz .mark.ng').length,
  ans: document.querySelectorAll('#quiz .ch.ans').length,
  wrong: document.querySelectorAll('#quiz .ch.wrong').length,
  wrongExpected: picked.filter((p, i) => p !== null && p !== qs[i].a).length,
  title: ($('result').textContent || '').includes('上次考試結果'),
  score: ($('result').querySelector('.score') || {}).textContent || '',
  keys: qs.map(keyOf),
}));
ok('回看：30 題已批改、進入交卷後狀態', rv.shown && rv.cards === 30 && rv.marks === 30 && rv.ans === 30);
ok('回看：錯題標紅與作答一致、成績卡有日期與分數', rv.wrong === rv.wrongExpected && rv.title && /\d+ \/ 30/.test(rv.score));
ok('回看的題目與交卷時那份相同', rv.keys.join() === ex1.keys.join());
await page.click('#again');
await page.waitForTimeout(300);

await page.click('#go');
await page.waitForTimeout(500);
const ex2 = await page.evaluate(() => qs.map(keyOf));
ok('第二次抽題與第一次完全不重複', ex2.length === 30 && ex2.every(k => !ex1.keys.includes(k)));

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

// 版面：各寬度不得橫向溢出
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
