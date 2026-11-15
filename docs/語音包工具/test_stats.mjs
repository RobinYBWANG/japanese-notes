// stats.html（網站統計頁）驗證：用假的 Worker 回應，檢查密碼流程、日期範圍、
// 考試重組（舊版、試點、作廢、新版完整）、頁面分鐘數、跳脫、記住密碼、手機版面。執行：node test_stats.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL = pathToFileURL(path.resolve(HERE, '..', 'stats.html')).href;
const API = 'https://mock.stats/';
const PW = 'right-password';

const checks = [];
const ok = (name, cond, info) => { checks.push([name, !!cond]); if (!cond && info !== undefined) console.log('  ↳', JSON.stringify(info).slice(0, 400)); };

const ex = (t, ev, o = {}) => Object.assign({ dateHourMinute: t, eventName: ev, deviceCategory: 'mobile', exam_type: 'full', paper: 'A 卷',
  section: '(not set)', passed: '(not set)', answered_band: '(not set)', skipped: '(not set)', eventCount: 1, score: 0, score_lang: 0,
  score_listen: 0, answered: 0, correct: 0, seconds: 0, answered_total: 0, total_seconds: 0 }, o);
const DATA = {
  start: '7daysAgo', end: 'today',
  now: [{ activeUsers: 1 }],
  nowPages: [
    { unifiedScreenName: '大家的日本語｜第9課｜文法', minutesAgo: '01', deviceCategory: 'mobile', activeUsers: 1 },
    { unifiedScreenName: '大家的日本語｜第8課｜單字', minutesAgo: '12', deviceCategory: 'mobile', activeUsers: 1 },
    { unifiedScreenName: 'N5 模擬考', minutesAgo: '04', deviceCategory: 'desktop', activeUsers: 1 },
  ],
  nowEvents: [
    { eventName: 'still_here', minutesAgo: '01', deviceCategory: 'mobile', eventCount: 3 },
    { eventName: 'page_view', minutesAgo: '12', deviceCategory: 'mobile', eventCount: 1 },
    { eventName: 'page_leave', minutesAgo: '04', deviceCategory: 'desktop', eventCount: 1 },
    { eventName: 'still_here', minutesAgo: '09', deviceCategory: 'desktop', eventCount: 2 },
    { eventName: 'exam_section', minutesAgo: '06', deviceCategory: 'desktop', eventCount: 1 },
  ],
  days: [{ date: '20261101', activeUsers: 2, newUsers: 1, sessions: 3 }, { date: '20261103', activeUsers: 2, newUsers: 0, sessions: 2 }],
  exams: [
    // 11/1 舊版：section 是「進去的那科」、沒有題數秒數；休息有秒數
    ex('202611011610', 'exam_start'),
    ex('202611011620', 'exam_section', { section: '言語知識（文法）・読解' }),
    ex('202611011620', 'exam_break', { seconds: 7, skipped: 'yes' }),
    ex('202611011649', 'exam_section', { section: '聴解' }),
    ex('202611011649', 'exam_break', { seconds: 6, skipped: 'yes' }),
    ex('202611011712', 'exam_finish', { score: 136, passed: 'yes' }),
    ex('202611011713', 'exam_review'),
    // 11/3 電腦：先看舊詳解，再 3 秒交第一科、到聴解就關掉 → 回來作廢，再開 B 卷
    ex('202611031922', 'exam_review', { deviceCategory: 'desktop' }),
    ex('202611032017', 'exam_start', { deviceCategory: 'desktop' }),
    ex('202611032017', 'exam_section', { deviceCategory: 'desktop', section: '言語知識（文字・語彙）', seconds: 3 }),
    ex('202611032018', 'exam_section', { deviceCategory: 'desktop', section: '言語知識（文法）・読解', seconds: 20 }),
    ex('202611032018', 'exam_break', { deviceCategory: 'desktop', seconds: 2, skipped: 'yes' }),
    ex('202611032019', 'exam_abandon', { deviceCategory: 'desktop' }),
    ex('202611032019', 'exam_start', { deviceCategory: 'desktop', paper: 'B 卷' }),
    // 11/10 新版完整一場（簡易版）
    ex('202611101900', 'exam_start', { exam_type: 'easy', paper: '第 2 回' }),
    ex('202611101910', 'exam_section', { exam_type: 'easy', paper: '第 2 回', section: '文字・語彙', answered: 12, correct: 10, seconds: 590 }),
    ex('202611101928', 'exam_section', { exam_type: 'easy', paper: '第 2 回', section: '文法・読解', answered: 13, correct: 9, seconds: 1080 }),
    ex('202611101941', 'exam_finish', { exam_type: 'easy', paper: '第 2 回', section: '聴解', answered: 13, correct: 11, seconds: 780,
      score: 142, passed: 'yes', score_lang: 90, score_listen: 52, answered_total: 38, total_seconds: 2450, answered_band: 'all' }),
  ],
  pages: [
    { dateHour: '2026111020', eventName: 'page_view', pageTitle: '大家的日本語｜第9課｜文法', deviceCategory: 'mobile', eventCount: 2 },
    { dateHour: '2026111020', eventName: 'still_here', pageTitle: '大家的日本語｜第9課｜文法', deviceCategory: 'mobile', eventCount: 3 },
    { dateHour: '2026111021', eventName: 'page_view', pageTitle: '<img src=x onerror="window.__xss=1">', deviceCategory: 'desktop', eventCount: 1 },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(api => { window.__STATS_API = api; }, API);
const bodies = [];
await page.route(API + '**', async route => {
  const b = JSON.parse(route.request().postData());
  bodies.push(b);
  if (b.password !== PW) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"wrong_password"}' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(DATA) });
});

await page.goto(URL);
ok('頁面不載入 GA（自己看不會被算進去）', (await page.content()).indexOf('googletagmanager') < 0);
ok('打開時沒記住密碼就不會自動查', bodies.length === 0);

// 入口只有密碼欄和「進入」，查詢畫面先藏起來、開頭沒有說明文字
const gate = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('#login input')].map(i => i.type), buttons: [...document.querySelectorAll('#login button')].map(b => b.textContent),
  mainHidden: document.getElementById('main').offsetParent === null, text: document.body.innerText.replace(/\s+/g, '') }));
ok('入口只有一個密碼欄、一個「進入」按鈕，查詢畫面藏著', gate.inputs.join() === 'password' && gate.buttons.join() === '進入' && gate.mainHidden, gate);
ok('入口沒有其他文字（說明拿掉了）', gate.text === '進入', gate.text);

// 密碼錯：留在入口
await page.fill('#pw', 'wrong');
await page.press('#pw', 'Enter'); await page.waitForTimeout(300);
ok('密碼錯顯示「密碼不對」、留在入口', (await page.textContent('#msg')).includes('密碼不對') && await page.locator('#main').isHidden());

// 密碼對：換到查詢畫面
await page.fill('#pw', PW);
await page.click('#go'); await page.waitForTimeout(400);
ok('密碼對：入口藏起來、出現查詢畫面', await page.locator('#login').isHidden() && await page.locator('#main').isVisible());
const out = await page.textContent('#out');
ok('預設查過去 7 天（6daysAgo～today）', bodies.at(-1).start === '6daysAgo' && bodies.at(-1).end === 'today', bodies.at(-1));
ok('摘要：人次、考試次數、交卷次數', /共 4 人次來過；考試 4 次（交卷 2 次）/.test(out), out.slice(0, 200));
ok('現在：還開著的筆記頁標「還開著」，已離開的標幾分鐘前離開', /手機・大家的日本語｜第9課｜文法：還開著/.test(out) && /電腦・N5 模擬考：4 分鐘前離開/.test(out), out);
ok('現在：同一台裝置較早看的頁面只標「幾分鐘前看過」', /手機・大家的日本語｜第8課｜單字：12 分鐘前看過/.test(out), out);
ok('現在：列出考試動作與裝置', /電腦 6 分鐘前：交了一科/.test(out), out);
ok('全部查到時不顯示「有些資料沒查到」', !/有些資料沒查到/.test(out));
ok('11/1 舊版：列出分數合格、休息跳過、看了詳解，註明沒有各科題數',
   /136 分 合格/.test(out) && /休息 7 秒（按了跳過）/.test(out) && /舊版紀錄/.test(out) && /之後看了詳解/.test(out));
ok('11/3 電腦 A 卷：標出只是點過去、第一科沒作答 3 秒、作廢', /看起來只是點過去試試/.test(out) && /言語知識（文字・語彙）：答 0 題、對 0 題，3 秒 沒作答/.test(out) && /20:19 考到一半離開，這次作廢/.test(out));
ok('11/3 先看詳解（沒有對應的考試）單獨列一行', /19:22　電腦・N5 正式版 A 卷：看詳解/.test(out));
ok('11/3 B 卷只開始：沒有交卷紀錄', /20:19　電腦・N5 正式版 B 卷/.test(out) && /沒有交卷紀錄/.test(out));
ok('11/10 新版：三科答對題數與時間、兩區分分數、總時間',
   /文字・語彙：答 12 題、對 10 題，10 分鐘/.test(out) && /聴解：答 13 題、對 11 題，13 分鐘/.test(out)
   && /142 分 合格/.test(out) && /言語知識・読解 90／聴解 52/.test(out) && /作答共 41 分鐘/.test(out));
const at = s => out.indexOf(s);
ok('考試依時間新到舊', at('11/10（') < at('11/3（') && at('11/3（') < at('11/1（'), [at('11/10（'), at('11/3（'), at('11/1（')]);
ok('頁面：開了幾次、心跳換算分鐘、裝置與時段', /大家的日本語｜第9課｜文法：開 2 次，約 6 分鐘（手機；20 點）/.test(out), out);
ok('GA 傳回的頁面標題當純文字顯示（不會執行）', (await page.evaluate(() => window.__xss)) === undefined && /<img src=x/.test(out));
ok('每天人數表', await page.locator('#out table tr').count() === 3);

// 換日期範圍
await page.click('[data-r="yesterday"]'); await page.waitForTimeout(300);
ok('按「昨天」直接重查 yesterday', bodies.at(-1).start === 'yesterday' && bodies.at(-1).end === 'yesterday');
await page.click('[data-r="custom"]');
await page.fill('#from', '2026-11-01'); await page.fill('#to', '2026-11-03');
await page.click('#apply'); await page.waitForTimeout(300);
ok('自訂日期照填的送', bodies.at(-1).start === '2026-11-01' && bodies.at(-1).end === '2026-11-03');

// 同一個分頁重新整理不用再打密碼；密碼不存進 localStorage（關掉分頁就要重打）
const n = bodies.length;
await page.reload(); await page.waitForTimeout(500);
ok('重新整理：自動帶密碼進入查詢畫面', bodies.length === n + 1 && bodies.at(-1).password === PW && await page.locator('#main').isVisible());
ok('密碼沒有存進 localStorage', (await page.evaluate(() => JSON.stringify(localStorage))).indexOf(PW) < 0);

// 手機版面
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok('390px 寬不會橫向溢出', sw <= 390, sw);

// 某一組被 GA 拒絕：列出原因，其他照畫
await page.route(API + '**', route => route.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify(Object.assign({}, DATA, { nowPages: { error: 'runRealtimeReport 400 cannot be queried together' } })) }));
await page.click('[data-r="7"]'); await page.waitForTimeout(300);
const partial = await page.textContent('#out');
ok('單一查詢失敗：標出哪一組、原因，其他照常顯示', /有些資料沒查到/.test(partial) && /目前在看的頁面：runRealtimeReport 400/.test(partial) && /142 分 合格/.test(partial), partial.slice(0, 200));

// 沒資料
await page.route(API + '**', route => route.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ now: [], nowPages: [], nowEvents: [], days: [], exams: [], pages: [] }) }));
await page.click('[data-r="30"]'); await page.waitForTimeout(300);
const empty = await page.textContent('#out');
ok('沒資料時說沒人來、沒人考、沒人在線', /沒有人來過/.test(empty) && /沒有人考試/.test(empty) && /沒有人在線上/.test(empty));

// 登出：回到入口、清掉資料與記住的密碼
await page.click('#logout'); await page.waitForTimeout(200);
ok('登出：回到入口、資料清空、這個分頁不再記住密碼', await page.locator('#login').isVisible() && (await page.textContent('#out')) === ''
   && (await page.evaluate(() => sessionStorage.getItem('jp_stats_pw'))) === null);
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
let fail = 0;
for (const [nm, c] of checks) { console.log((c ? 'PASS' : 'FAIL') + '  ' + nm); if (!c) fail++; }
console.log(fail ? '\n' + fail + ' 項 FAIL' : '\n全部 PASS');
process.exit(fail ? 1 : 0);
