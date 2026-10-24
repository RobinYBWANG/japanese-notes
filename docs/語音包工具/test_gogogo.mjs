// 日本語GOGOGO 1 筆記（gogogo-notes.html）驗證
// ① 真頁面：載入沒錯誤；每個 🔊 都有音檔（有內容之後才有意義）
// ② 測試用假資料（只在記憶體裡換掉資料區塊，不會寫回檔案）：把每個分頁的顯示邏輯跑一遍
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(process.argv[2] || path.join(HERE, '..', 'gogogo-notes.html'));
const checks = [];
const ok = (n, c) => checks.push([n, !!c]);
const browser = await chromium.launch();

// ---------- ① 真頁面 ----------
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(pathToFileURL(HTML).href);
  await page.waitForTimeout(600);
  const first = await page.evaluate(() => lesson);
  const r0 = await page.evaluate(() => {
    const miss = [], seen = new Set();
    const lessons = LESSON_KEYS.concat([ALL]);
    for (const n of lessons) {
      switchLesson(n);
      for (const [s] of subsFor(n)) {
        switchSection(s);
        document.querySelectorAll('main [data-say]').forEach(el => {
          const t = el.getAttribute('data-say');
          if (t && !seen.has(t)) { seen.add(t); if (!vvClip(t, 'A')) miss.push(t); }
        });
      }
    }
    return { lessons: LESSON_KEYS.length, says: seen.size, miss,
             tabs: document.querySelectorAll('#tabs .tab').length,
             base: VV_BASE, title: document.title };
  });
  const r = Object.assign(r0, { first });
  ok('真頁面：載入沒有錯誤', errs.length === 0);
  ok('真頁面：第一次打開停在第一課（不是總學習）', r.first === (r.lessons ? 1 : 0));
  ok('真頁面：頁籤數＝課數＋總學習', r.tabs === r.lessons + 1);
  ok('真頁面：音檔資料夾是 audio/gogogo/', r.base === 'audio/gogogo/');
  ok('真頁面：每個 🔊 都有音檔（' + r.says + ' 句，缺 ' + r.miss.length + '）', r.miss.length === 0);
  if (r.miss.length) console.log('  缺音檔：', r.miss.slice(0, 10));

  // ⚙ 語音設定：在「共 N 筆單字」右邊；三個角色＋語速；存進 jp_tts_vv（跟大家的日本語共用，別的欄位要保留）
  await page.evaluate(() => localStorage.setItem('jp_tts_vv', JSON.stringify({ voiceA: '2', voiceB: '11', rate: 0.9, mode: 'shadow' })));
  await page.reload(); await page.waitForTimeout(500);
  const gearRight = await page.evaluate(() => {
    const s = document.getElementById('stat').getBoundingClientRect(), g = document.getElementById('ttsbtn').getBoundingClientRect();
    return g.left >= s.right - 1 && Math.abs((g.top + g.bottom) / 2 - (s.top + s.bottom) / 2) < 12;
  });
  await page.click('#ttsbtn'); await page.waitForTimeout(150);
  const opened = await page.evaluate(() => document.getElementById('voicemodal').classList.contains('show'));
  const opts = await page.evaluate(() => [...document.querySelectorAll('#voicesel option')].map(o => o.value).join(','));
  await page.selectOption('#voicesel', '13');
  await page.evaluate(() => { const r = document.getElementById('ratein'); r.value = '1.2'; r.dispatchEvent(new Event('input')); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jp_tts_vv')));
  const testClips = await page.evaluate(() => {
    const t = document.getElementById('vtest').getAttribute('data-say');
    return ['2', '13', '11'].every(v => !!(VV_SAY[vvNorm(t)] || {})[v]);
  });
  const usesNew = await page.evaluate(() => voiceFor('A') === '13' && vvClip(sayText(rowsOf(LESSON_KEYS[0] || 1)[0] || { kana: 'あ' }), 'A') === ((VV_SAY[vvNorm(sayText(rowsOf(LESSON_KEYS[0] || 1)[0] || { kana: 'あ' }))] || {})['13'] || null));
  await page.click('#vclose'); await page.waitForTimeout(100);
  const closed = await page.evaluate(() => !document.getElementById('voicemodal').classList.contains('show'));
  ok('⚙ 在「共 N 筆單字」右邊', gearRight);
  ok('⚙ 打開語音設定、三個角色可選', opened && opts === '2,13,11');
  ok('⚙ 換聲音、調語速會存起來，大家的日本語用的欄位不會被洗掉',
     saved.voiceA === '13' && Math.abs(saved.rate - 1.2) < 1e-9 && saved.voiceB === '11' && saved.mode === 'shadow');
  ok('⚙ 換了聲音之後單字改用那個聲音的音檔', usesNew);
  ok('⚙ 試聽句三個聲音都有音檔', testClips);
  ok('⚙ 關閉', closed);
  await page.evaluate(() => localStorage.removeItem('jp_tts_vv'));

  // 🔍 搜尋（同大家的日本語）：單詞／假名／詞義／備註＋文法內容；點結果跳到該課並標亮那一列
  if (r.lessons) {
    await page.evaluate(() => switchLesson(ALL));
    await page.fill('#search', '職員');
    await page.waitForTimeout(150);
    const sr = await page.evaluate(() => ({
      shown: document.getElementById('searchresults').style.display === 'block',
      items: [...document.querySelectorAll('#searchresults .sr-item')].map(e => e.querySelector('.sr-loc').textContent + '｜' + e.querySelector('.sr-txt').textContent),
    }));
    const hit = await page.locator('#searchresults .sr-item', { hasText: /^.*單字.*職員　しょくいん/ }).first();
    await hit.click(); await page.waitForTimeout(250);
    const jumped = await page.evaluate(() => {
      const tr = document.querySelector('#voc-body tr.hitrow');
      return { lesson, section, hitWord: tr ? tr.querySelector('td.word').textContent : null,
               closed: document.getElementById('searchresults').style.display === 'none' };
    });
    await page.fill('#search', 'wa'); await page.waitForTimeout(120);
    const gram = await page.evaluate(() => [...document.querySelectorAll('#searchresults .sr-loc')].some(e => /文法/.test(e.textContent)));
    await page.fill('#search', 'おっしゃい'); await page.waitForTimeout(120);
    const gplusHit = await page.evaluate(() => [...document.querySelectorAll('#searchresults .sr-loc')].some(e => /文法補充/.test(e.textContent)));
    await page.fill('#search', 'zzzz'); await page.waitForTimeout(120);
    const none = await page.evaluate(() => /找不到/.test(document.getElementById('searchresults').textContent));
    await page.press('#search', 'Escape');
    const esc = await page.evaluate(() => document.getElementById('searchresults').style.display === 'none');
    await page.fill('#search', '');
    ok('🔍 搜「職員」找得到單字（也會比對詞義：会社員＝公司職員）',
       sr.shown && sr.items.some(t => /職員　しょくいん/.test(t)) && sr.items.some(t => /会社員/.test(t)));
    ok('🔍 點結果跳到第1課單字、標亮那一列、下拉框收起', jumped.lesson === 1 && jumped.section === 'vocab' && jumped.hitWord === '職員' && jumped.closed);
    ok('🔍 也會搜文法內容', gram);
    ok('🔍 也會搜文法補充', gplusHit);
    const subs1 = await page.evaluate(() => { switchLesson(1); return subsFor(1).map(x => x[1]).join('│'); });
    ok('真頁面：第1課分頁＝單字│文法│文法補充│助詞（' + subs1 + '）', subs1 === '單字│文法│文法補充│助詞');
    ok('🔍 找不到時有提示、Esc 會收起', none && esc);
  }
  await page.close();
}

// ---------- ② 假資料 ----------
const FIX = {
  names: { 1: '第1課\n測試一', 2: '第2課\n測試二' },
  lessons: {
    1: [
      { word: '学生', kana: 'がくせい', mean: '學生', note: '**粗體**備註', pos: 'n' },
      { word: '食べます', kana: 'たべます', mean: '吃', note: '', pos: 'verb' },
      { word: 'きれい', kana: 'きれい', mean: '漂亮', note: '', pos: 'adjna' },
      { word: 'いい', kana: 'いい', mean: '好', note: '', pos: 'adji' },
      { word: 'かっこいい', kana: 'かっこいい', mean: '帥', note: '', pos: 'adji' },
      { word: '大きい', kana: 'おおきい', mean: '大', note: '', pos: 'adji' },
      { word: 'とても', kana: 'とても', mean: '非常', note: '', pos: 'adv' },
    ],
    2: [
      { word: '学生', kana: 'がくせい', mean: '學生', note: '', pos: 'n' },   // 跨課重複 → 總表只算一次
      { word: '先生', kana: 'せんせい', mean: '老師', note: '<script>x</script>', pos: 'n' },
    ],
  },
};
const FIX_JS = 'const GRAMMAR={1:`<h3>第1課</h3><div class="gp"><div class="gp-label">① 測試</div><div class="gp-ex">例：私は 学生です。' +
  '<button class="spk gspk" data-say="わたしは がくせいです">🔊</button></div></div>`};\n' +
  'const JOSHI_ROWS=`<tr data-jo="は" data-les="1"><td class="jo-c"><span class="jo">は</span></td><td class="jo-p">名詞＋は</td>' +
  '<td class="jo-logic">主題</td><td class="jo-u">主題</td><td class="jo-ex"><div class="jo-one">私<span class="jo">は</span> 学生です' +
  '<button class="spk gspk" data-say="わたしは がくせいです">🔊</button><span class="jo-zh">我是學生</span></div></td><td class="jo-note">測試</td></tr>' +
  '<tr data-jo="が" data-les="2"><td class="jo-c"><span class="jo">が</span></td><td class="jo-p">名詞＋が</td><td class="jo-logic">主語</td>' +
  '<td class="jo-u">主語</td><td class="jo-ex"></td><td class="jo-note">第2課的</td></tr>`;';

let fixHtml = fs.readFileSync(HTML, 'utf8');
fixHtml = fixHtml.replace(/(<script id="vocab-data" type="application\/json">)[\s\S]*?(<\/script>)/,
  // 實際寫檔時 < 一律轉成 \u003c（不然備註裡的 </script> 會把資料區塊提早關掉），測試照做
  (m, a, b) => a + JSON.stringify(FIX).replace(/</g, '\\u003c') + b);
// 不管真檔裡的 GRAMMAR／JOSHI_ROWS 有沒有內容都整段換成假資料（樣板字串裡不會有反引號）
const before = fixHtml;
fixHtml = fixHtml.replace(/const GRAMMAR=\{[\s\S]*?\};\nconst JOSHI_ROWS=`[^`]*`;/, FIX_JS);
if (fixHtml === before) throw new Error('換不到 GRAMMAR／JOSHI_ROWS，假資料測試會失準');
const before2 = fixHtml;
fixHtml = fixHtml.replace(/const GRAMMAR_PLUS=\{[\s\S]*?\n\};/,
  'const GRAMMAR_PLUS={1:`<h3>補充</h3><div class="gp"><div class="gp-label">補充</div></div>`};');
if (fixHtml === before2) throw new Error('換不到 GRAMMAR_PLUS，假資料測試會失準');
const FAKE = 'https://robinybwang.github.io/japanese-notes/gogogo-notes.html';
for (const [label, vp] of [['桌機', { width: 1280, height: 900 }], ['手機', { width: 375, height: 812 }]]) {
  const page = await browser.newPage({ viewport: vp });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  // GA 的請求攔下來丟掉；頁面本身用假資料版本
  await page.route(/googletagmanager\.com|google-analytics\.com/, r => r.abort());
  await page.route(FAKE, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixHtml }));
  await page.route(/japanese-notes\/(img|audio)\//, r => r.abort());
  await page.goto(FAKE);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const o = {};
    localStorage.clear();
    switchLesson(1);
    o.tabs = [...document.querySelectorAll('#tabs .tab')].map(t => t.innerText.replace(/\n/g, ' '));
    o.subs1 = [...document.querySelectorAll('#subtabs .subtab')].map(e => e.textContent);
    switchSection('vocab');
    o.vocabRows = document.querySelectorAll('#voc-body tbody tr').length;
    o.bold = !!document.querySelector('#voc-body td.lv-note b');
    switchSection('verb');
    o.verbForms = [...document.querySelectorAll('#verb-body .vf')].map(e => e.textContent + '|' + e.dataset.say);
    switchSection('adj');
    o.adjNeg = [...document.querySelectorAll('#adj-body tbody tr')].map(tr => tr.children[0].textContent + '→' + tr.children[4].textContent);
    switchSection('adv');
    o.advRows = document.querySelectorAll('#adv-body tbody tr').length;
    switchSection('grammar');
    o.gram = document.querySelectorAll('#grammar-body .gp').length;
    switchSection('gplus');
    o.gplus = document.querySelectorAll('#gplus-body .gp').length;
    switchSection('joshi');
    o.joKey = [...document.querySelectorAll('#joshi-body tr.jo-key')].map(t => t.dataset.jo);
    o.joFuture = [...document.querySelectorAll('#joshi-body tr.jo-future')].map(t => t.dataset.jo);
    switchLesson(2);
    o.subs2 = [...document.querySelectorAll('#subtabs .subtab')].map(e => e.textContent);
    o.noScript = !document.querySelector('#voc-body script');
    switchLesson(ALL);
    o.subsAll = [...document.querySelectorAll('#subtabs .subtab')].map(e => e.textContent);
    o.allRows = [...document.querySelectorAll('#all-body tbody tr')].map(tr => tr.children[0].textContent + tr.children[1].textContent);
    o.stat = document.getElementById('stat').textContent;
    o.docSW = document.documentElement.scrollWidth; o.vw = document.documentElement.clientWidth;
    o.ga = typeof window.gtag === 'function';
    o.hasSearch = !!document.getElementById('search') && document.getElementById('search').getBoundingClientRect().width > 100;
    return o;
  });
  if (label === '桌機') {
    ok('假資料：頁籤（2 課＋總學習）', r.tabs.length === 3 && /測試一/.test(r.tabs[0]) && /總學習/.test(r.tabs[2]));
    ok('假資料：第1課分頁＝單字／動詞／形容詞／副詞／文法／文法補充／助詞', r.subs1.join('') === '單字動詞形容詞副詞文法文法補充助詞');
    ok('假資料：第2課只有單字和助詞（沒內容的分頁不出現）', r.subs2.join('') === '單字助詞');
    ok('假資料：總學習只有單字總表', r.subsAll.join('') === '單字總表');
    ok('假資料：單字表 7 列、備註的 **粗體** 有轉成粗體', r.vocabRows === 7 && r.bold);
    ok('假資料：備註裡的 HTML 不會被執行', r.noScript);
    ok('假資料：動詞變化（ません／ました／ませんでした，念假名）',
       r.verbForms.join(',') === '食べません|たべません,食べました|たべました,食べませんでした|たべませんでした');
    ok('假資料：形容詞否定（いい→よく、かっこいい→かっこよく）',
       r.adjNeg.join(',') === 'きれい→きれいじゃ ありません,いい→よく ないです,かっこいい→かっこよく ないです,大きい→大きく ないです');
    ok('假資料：副詞表 1 列', r.advRows === 1);
    ok('假資料：文法區塊顯示', r.gram === 1);
    ok('假資料：文法補充區塊顯示', r.gplus === 1);
    ok('假資料：助詞表本課標色、之後的課變淡', r.joKey.join('') === 'は' && r.joFuture.join('') === 'が');
    // 第1課 7 個＋第2課 2 個，「学生」兩課都有 → 8 個，学生 只出現一次、標第1課
    ok('假資料：單字總表跨課去重（8 個字，学生只算一次）',
       r.allRows.length === 8 && r.stat === '共 8 筆單字' &&
       r.allRows.filter(t => t.includes('学生')).join() === '第1課学生');
    ok('假資料：GA 在 github.io 上會載入', r.ga);
    ok('假資料：桌機沒有錯誤', errs.length === 0);
  } else {
    ok('假資料：手機寬度沒有左右溢出（含搜尋框）', r.docSW <= r.vw + 1 && r.hasSearch);
    ok('假資料：手機沒有錯誤', errs.length === 0);
  }
  // 遮欄位：取消勾選「假名」→ 遮住；點一下掀開、再點一下蓋回去
  if (label === '桌機') {
    await page.evaluate(() => { switchLesson(1); switchSection('vocab'); });
    await page.locator('#voc-body .colvis-cb[data-key="vocab:kana"]').uncheck();
    const masked = await page.locator('#voc-body td.kana.masked').count();
    const td = page.locator('#voc-body td.kana.masked').first();
    await td.click(); const open1 = await td.evaluate(e => e.classList.contains('revealed'));
    await td.click(); const open2 = await td.evaluate(e => e.classList.contains('revealed'));
    ok('假資料：遮欄位（遮 7 格、點開、再點蓋回）', masked === 7 && open1 && !open2);
    await page.locator('#voc-body .colvis-cb[data-key="vocab:kana"]').check();
  }
  await page.close();
}
await browser.close();

let fail = 0;
for (const [n, pass] of checks) { console.log((pass ? 'PASS  ' : 'FAIL  ') + n); if (!pass) fail++; }
console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
