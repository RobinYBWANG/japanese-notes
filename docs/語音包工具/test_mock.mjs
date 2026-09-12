// n5-mock-easy.html 回歸測試：題庫結構、配額（正式 N5 各大題的一半）、音檔覆蓋、三科依序作答、180 分制計分、
// 交卷記錄、上次考卷回看、兩次抽題不重複、版面
// 用法：node test_mock.mjs [要驗的 html，預設 ..\n5-mock-easy.html]
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(process.argv[2] || path.join(HERE, '..', 'n5-mock-easy.html'));
const N = 38;                       // 每份題數：12 + 13 + 13
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
  const enough = Object.keys(QUOTA).every(k => types[k] >= QUOTA[k] * 5);
  const uncovered = BANK.filter(q => q.audio && !vvCover(q)).length;
  // 選項洗牌後也要有音檔（2026-09-12：以前「1ばん。選項」整句合成，洗牌後就退回瀏覽器語音）
  const uncoveredDrawn = pickExam().map(shuffleChoices).filter(q => q.audio && !vvCover(q)).length;
  return { n: BANK.length, types, bad, passOk, orderOk, quotaOk, quotaTotal, enough, uncovered, uncoveredDrawn, hasAll: VV_HAS_ALL,
           clips: Object.keys(VV.audio).length, texts: Object.keys(VV.say).length };
});
ok('題庫 195 題', info.n === 195);
ok('每題結構正確', info.bad.length === 0);
ok('讀解／文章文法每篇題數正確、短文不重複', info.passOk);
ok('題庫依 科目→問題N 排序', info.orderOk);
ok('配額表 14 個題型一一對應、合計 ' + N, info.quotaOk && info.quotaTotal === N && Object.keys(info.types).length === 14);
ok('每個題型夠抽 5 份', info.enough);
ok('聴解音檔全覆蓋（含題目旁白與選項朗讀）', info.uncovered === 0 && info.hasAll);
ok('抽出的考卷（選項洗牌後）音檔也全覆蓋', info.uncoveredDrawn === 0);

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
ok('四格圖片題 14 題：選項 1〜4、固定順序', pics.four === 14 && pics.fourOk);
ok('發話表現 15 題都有場景圖', pics.scenes === 15);
ok('29 張圖都載得進來、寬度夠', pics.bad.length === 0);
if (pics.bad.length) console.log('壞圖:', pics.bad);

// 第一次考：抽 38 題、三科 12/13/13、各題型合配額、讀解四篇各顯示一次、只有第一科能作答
await page.evaluate(() => localStorage.clear());
await page.click('#go');
await page.waitForTimeout(500);
const ex1 = await page.evaluate(() => {
  const sec = {}, types = {};
  qs.forEach(q => { sec[q.sec] = (sec[q.sec] || 0) + 1; const k = q.sec + '|' + q.type; types[k] = (types[k] || 0) + 1; });
  return { keys: qs.map(keyOf), sec, types,
           cards: document.querySelectorAll('#quiz .card').length,
           passages: document.querySelectorAll('#quiz .passage').length,
           quotaMatch: Object.keys(QUOTA).every(k => types[k] === QUOTA[k]),
           left, btn: $('submit').textContent,
           locked: document.querySelectorAll('#tabs .tab.lock').length };
});
ok('抽 ' + N + ' 題', ex1.keys.length === N && ex1.cards === N);
ok('三科 12／13／13', ex1.sec[1] === 12 && ex1.sec[2] === 13 && ex1.sec[3] === 13);
ok('各題型符合配額', ex1.quotaMatch);
ok('讀解四篇（文章文法／短文／中文／情報検索）各顯示一次', ex1.passages === 4);
ok('第一科：計時 10:00、按鈕是「下一科」、另外兩科鎖住', ex1.left >= 10 * 60 - 2 && ex1.btn.indexOf('下一科') === 0 && ex1.locked === 2);

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
ok('下一科：進入文法讀解、計時重設 20:00、第一科鎖住', s2.cur === 2 && s2.left >= 20 * 60 - 2 && s2.pane2 && s2.lock1);
await page.click('#submit');
await page.waitForTimeout(300);
const s3 = await page.evaluate(() => ({ cur, left, btn: $('submit').textContent }));
ok('進入聴解：計時 15:00、按鈕變成「交卷」', s3.cur === 3 && s3.left >= 15 * 60 - 2 && s3.btn === '交卷');

// 聴解畫面：發話表現／即時応答的選項文字作答中看不到；圖片題有圖、選項是 1〜4
const hid = await page.evaluate(() => {
  const span = document.querySelector('.pane[data-sec="3"] .choices.row.hid .ch > span:last-child');
  const img = document.querySelector('.pane[data-sec="3"] img.qimg, .pane[data-sec="3"] .scene img');
  return { hidden: span && getComputedStyle(span).display === 'none', hasImg: !!img, hidCards: document.querySelectorAll('.pane[data-sec="3"] .choices.row.hid').length };
});
ok('作答中發話表現／即時応答的選項只唸不顯示（6 題）', hid.hidden && hid.hidCards === 6);
ok('聴解畫面有圖片', hid.hasImg);

// 播放一題聴解不噴錯
await page.click('#quiz .pane[data-sec="3"] .play');
await page.waitForTimeout(800);
await page.evaluate(() => stopPlay());
ok('點播放不噴錯', errors.length === 0);

// 交卷：180 分制、合格判定、14 個大題的答對數、記錄 38 題為考過
await page.click('#submit');
await page.waitForTimeout(500);
const res = await page.evaluate(() => ({
  score: ($('result').querySelector('.score') || {}).textContent || '',
  text: $('result').textContent || '',
  rows: $('result').querySelectorAll('.brkdown tr').length,
  seen: JSON.parse(localStorage.getItem('jp_n5mock_seen') || '[]').length,
  locked: document.querySelectorAll('#tabs .tab.lock').length,
  choiceShown: getComputedStyle(document.querySelector('.choices.row.hid .ch > span:last-child')).display !== 'none',
}));
ok('交卷：成績是 180 分制', /\d+ \/ 180/.test(res.score) && res.text.includes('/ 120') && res.text.includes('/ 60'));
ok('交卷後只唸不顯示的選項文字出現', res.choiceShown);
ok('交卷：有合格判定與 14 個大題的答對數', /合格/.test(res.text) && res.rows === 14 && res.locked === 0);
ok('交卷後記錄 ' + N + ' 題為考過', res.seen === N);

// 再考一次：開始畫面顯示已考過、有「上次考試結果」
await page.click('#again');
await page.waitForTimeout(300);
ok('開始畫面顯示已考過', (await page.textContent('#pool') || '').includes('已考過 ' + N + ' 題'));
const lastBtn = await page.evaluate(() => !$('last').classList.contains('hide') && !!localStorage.getItem('jp_n5mock_last'));
ok('交卷後開始畫面有「上次考試結果」', lastBtn);

// 上次考試結果：回看時 38 題已批改、錯題標紅數量與作答一致、成績卡標示日期、題目與交卷時相同
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
ok('回看：' + N + ' 題已批改、進入交卷後狀態', rv.shown && rv.cards === N && rv.marks === N && rv.ans === N);
ok('回看：錯題標紅與作答一致、成績卡有日期與分數', rv.wrong === rv.wrongExpected && rv.title && /\d+ \/ 180/.test(rv.score));
ok('回看的題目與交卷時那份相同', rv.keys.join() === ex1.keys.join());
await page.click('#again');
await page.waitForTimeout(300);

// 第二次抽題：與第一次完全不重複
await page.click('#go');
await page.waitForTimeout(500);
const ex2 = await page.evaluate(() => qs.map(keyOf));
ok('第二次抽題與第一次完全不重複', ex2.length === N && ex2.every(k => !ex1.keys.includes(k)));

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
