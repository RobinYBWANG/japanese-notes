// n5-mock-full.html（正式版模擬考）驗證：題庫結構、三科流程、休息、聴解、計分、歷史、詳解
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(HERE, '..');
const HTML = path.join(DOCS, 'n5-mock-full.html');
const URL = pathToFileURL(HTML).href;

let fail = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('dialog', d => d.accept());
await page.goto(URL);
await page.waitForTimeout(500);

// ───────── 題庫結構 ─────────
const info = await page.evaluate(() => {
  const p = PAPERS.A, out = { secs: [], bad: [], imgs: [], lines: 0, pos: {} };
  p.sections.forEach((sec, si) => {
    let n = 0;
    sec.parts.forEach((part, pi) => part.items.forEach((it, ii) => {
      n++;
      const tag = sec.label + ' ' + part.title + ' #' + (ii + 1);
      if (!(it.c.length === 3 || it.c.length === 4)) out.bad.push(tag + ' 選項數');
      if (!(it.a >= 0 && it.a < it.c.length)) out.bad.push(tag + ' 正解索引');
      if (new Set(it.c).size !== it.c.length) out.bad.push(tag + ' 選項重複');
      if (!it.e || it.e.length < 40) out.bad.push(tag + ' 解說太短');
      if (sec.key === 'choukai' && !(it.play && it.play.length)) out.bad.push(tag + ' 沒有音檔');
      if (sec.key !== 'choukai' && it.play) out.bad.push(tag + ' 非聴解卻有音檔');
      out.pos[it.a] = (out.pos[it.a] || 0) + 1;
      if (it.img) out.imgs.push(it.img);
      if (it.scene) out.imgs.push(it.scene);
      if (it.play) out.lines += it.play.length;
    }));
    out.secs.push({ label: sec.label, n, declared: sec.n });
  });
  return out;
});
ok('三科題數 21 / 22 / 24', JSON.stringify(info.secs.map(s => s.n)) === '[21,22,24]', info.secs);
ok('sections.n 和實際題數一致', info.secs.every(s => s.n === s.declared), info.secs);
ok('每題結構正確（選項數、正解、解說）', info.bad.length === 0, info.bad.slice(0, 5));
ok('正解不集中在同一個位置', Object.values(info.pos).every(v => v >= 8), info.pos);
ok('聴解 24 題共 ' + info.lines + ' 行（含留白）', info.lines > 100);
const pau = await page.evaluate(() => {
  const sec = PAPERS.A.sections[2], out = {};
  sec.parts.forEach(p => {
    out[p.title] = p.items.map(it => (it.play.find(l => l.p) || {}).p || 0);
  });
  return {out, closing: !!sec.closing, opening: !!sec.opening};
});
ok('問題1 每題留 5 秒看圖', Object.values(pau.out)[0].every(v => v === 5), pau.out);
ok('問題2 每題留 12 秒看文字選項', Object.values(pau.out)[1].every(v => v === 12), pau.out);
ok('問題3・4 沒有看選項的留白', Object.values(pau.out)[2].concat(Object.values(pau.out)[3]).every(v => v === 0));
ok('聴解有開頭總說明與結束語', pau.opening && pau.closing);

// 圖片檔存在
const missImg = [...new Set(info.imgs)].filter(p => !fs.existsSync(path.join(DOCS, p)));
ok('聴解用到的 ' + new Set(info.imgs).size + ' 張圖都在', missImg.length === 0, missImg);

// 音檔：每一行（含大題說明與例題）都查得到 clip，而且檔案存在
const au = await page.evaluate(() => {
  const need = [], p = PAPERS.A;
  p.sections.filter(s => s.key === 'choukai').forEach(sec => {
    if (sec.opening) need.push(['N', sec.opening]);
    sec.parts.forEach(part => {
    need.push(['N', part.instr]);
    (part.ex ? part.ex.play : []).forEach(l => { if (!l.p) need.push([l.r, l.t]); });
    part.items.forEach(it => it.play.forEach(l => { if (!l.p) need.push([l.r, l.t]); }));
  });});
  const miss = need.filter(([r, t]) => !SAY[r + '|' + t]);
  return { n: need.length, miss: miss.slice(0, 5), ids: [...new Set(need.map(([r, t]) => SAY[r + '|' + t]).filter(Boolean))] };
});
ok('每一行旁白／對白都有 clip（' + au.n + ' 行）', au.miss.length === 0, au.miss);
const missFile = au.ids.filter(id => !fs.existsSync(path.join(DOCS, 'audio', 'mockfull', id + '.ogg')));
ok('clip 檔案都存在（' + au.ids.length + ' 個）', missFile.length === 0, missFile.slice(0, 5));

// ───────── 計分 ─────────
const sc = await page.evaluate(() => {
  const p = PAPERS.A, all = {}, none = {}, edge = {};
  let i = 0;
  p.sections.forEach((sec, si) => sec.parts.forEach((part, pi) => part.items.forEach((it, ii) => {
    const k = si + '-' + pi + '-' + ii;
    all[k] = it.a;
    none[k] = (it.a + 1) % it.c.length;
    i++;
  })));
  // 邊界：言語知識對 14 題、聴解對 8 題 → 剛好到基準分
  let a = 0, b = 0;
  p.sections.forEach((sec, si) => sec.parts.forEach((part, pi) => part.items.forEach((it, ii) => {
    const k = si + '-' + pi + '-' + ii;
    if (sec.key === 'choukai') edge[k] = (b++ < 8) ? it.a : (it.a + 1) % it.c.length;
    else edge[k] = (a++ < 14) ? it.a : (it.a + 1) % it.c.length;
  })));
  return { all: grade(p, all), none: grade(p, none), edge: grade(p, edge) };
});
ok('全對 = 180 分、合格', sc.all.total === 180 && sc.all.pass, sc.all);
ok('全錯 = 0 分、不合格', sc.none.total === 0 && !sc.none.pass, sc.none);
ok('兩區分剛好到基準分（39+20=59）就不合格（總分沒到 80）',
   sc.edge.sa >= 38 && sc.edge.sb >= 19 && !sc.edge.pass, sc.edge);

// ───────── 流程：第1科 ─────────
await page.click('[data-start="A"]');
await page.waitForTimeout(300);
ok('第1科標題與計時', (await page.textContent('#secname')).includes('文字・語彙')
   && (await page.textContent('#clock')).startsWith('20:'), await page.textContent('#clock'));
ok('第1科 21 張題卡', await page.locator('#qbody .q').count() === 21);
ok('沒有洩漏答案（作答中看不到解說）', await page.locator('#qbody .exp').count() === 0);

// 全部答對
async function answerAll(si){
  await page.evaluate(s => {
    PAPERS.A.sections[s].parts.forEach((part, pi) => part.items.forEach((it, ii) => {
      const b = document.querySelector('[data-pick="' + s + '-' + pi + '-' + ii + ':' + it.a + '"]');
      if (b) b.click();
    }));
  }, si);
}
await answerAll(0);
ok('第1科答案都記下來了', Object.keys(await page.evaluate(() => state.ans)).length === 21);
await page.click('#foot button');
await page.waitForTimeout(300);
ok('進入休息畫面、倒數 20:00', !(await page.locator('#brk').isHidden())
   && (await page.textContent('#brkclock')) === '20:00');
ok('休息畫面有預告下一科', (await page.textContent('#brknext')).includes('文法'));

// ───────── 第2科 ─────────
await page.click('#brkskip');
await page.waitForTimeout(300);
ok('跳過休息後進入第2科、計時 40:00', (await page.textContent('#secname')).includes('文法')
   && (await page.textContent('#clock')).startsWith('40:'));
ok('第2科 22 張題卡', await page.locator('#qbody .q').count() === 22);
// 問題3 併成一篇（正式 N5 是一篇 4 格）後，第2科共 5 篇文章：問題3×1、問題4×2、問題5×1、問題6×1
ok('読解 5 篇文章都有顯示', await page.locator('#qbody .pass').count() === 5, await page.locator('#qbody .pass').count());
await answerAll(1);
await page.click('#foot button');
await page.waitForTimeout(300);
ok('第2科交卷後又是休息畫面', !(await page.locator('#brk').isHidden()));
ok('休息畫面提醒聴解不能重聽', (await page.textContent('#brknext')).includes('耳機'));

// ───────── 第3科 聴解 ─────────
await page.click('#brkskip');
await page.waitForTimeout(600);
await page.evaluate(() => { state.stop = true; if (window.player) player.pause(); });  // 測試不等 10 分鐘的音檔
ok('聴解沒有倒數計時器', await page.locator('#clock').isHidden());
ok('聴解顯示進度', !(await page.locator('#prog').isHidden()));
ok('聴解 24 張題卡＋4 張例題卡', await page.locator('#qbody .q').count() === 28
   && await page.locator('#qbody .q.exq').count() === 4, await page.locator('#qbody .q').count());
ok('例題卡直接標出答案', await page.locator('#qbody .q.exq ol.ch button.ok').count() === 4);
ok('例題卡標示不計分', (await page.textContent('#qbody')).includes('例題・不計分'));
ok('播說明／例題時有調音量的提示', await page.locator('#qbody .banner').count() === 1);
const hid = await page.evaluate(() => {
  const parts = PAPERS.A.sections[2].parts;
  const hideN = parts.filter(p => p.items[0].hideChoices).reduce((a, p) => a + p.items.length, 0);
  const picN = parts.reduce((a, p) => a + p.items.filter(it => it.img).length, 0);
  const shown = [...document.querySelectorAll('#qbody .q:not(.exq)')].filter(q =>
    [...q.querySelectorAll('ol.ch button span:not(.n)')].some(s => s.textContent.trim())).length;
  return { hideN, picN, shown };
});
// 四格圖題的選項只有 1〜4、発話表現／即時応答的選項作答中不顯示文字 → 只有ポイント理解看得到文字選項
ok('作答中只有ポイント理解看得到文字選項（圖片題 ' + hid.picN + '、只唸不顯示 ' + hid.hideN + '）',
   hid.shown === 24 - hid.hideN - hid.picN, hid);
await answerAll(2);
await page.click('#foot button');
await page.waitForTimeout(400);

// ───────── 成績 ─────────
ok('成績頁出現', !(await page.locator('#result').isHidden()));
const rtxt = await page.textContent('#result');
ok('全對 180 分、判定合格', rtxt.includes('180') && rtxt.includes('合格'), rtxt.slice(0, 80));
ok('成績列出兩個得分區分與基準分', rtxt.includes('120') && rtxt.includes('60') && rtxt.includes('38') && rtxt.includes('19'));

// ───────── 詳解 ─────────
await page.click('#foot button');   // 看詳解
await page.waitForTimeout(400);
ok('詳解頁出現、67 題都有解說（例題不列進去）', await page.locator('#review .exp').count() === 67
   && await page.locator('#review .q.exq').count() === 0);
ok('詳解標出正解', await page.locator('#review ol.ch button.ok').count() === 67);
ok('聴解有「重聽這一題」的按鈕（24 題）', await page.locator('#review [data-replay]').count() === 24);
ok('読解有全文翻譯', (await page.textContent('#review')).includes('passZh') === false
   && await page.locator('#review .zh').count() >= 24);

// ───────── 歷史紀錄 ─────────
await page.click('#foot button');   // 回選卷頁
await page.waitForTimeout(300);
ok('回到選卷頁、歷史多一筆', (await page.textContent('#home')).includes('180 / 180'));
const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('mf_hist_A') || '[]'));
ok('歷史紀錄存進 localStorage', hist.length === 1 && hist[0].total === 180 && hist[0].pass, hist[0]);

// ───────── 考到一半重新整理 = 作廢 ─────────
await page.click('[data-start="A"]');
await page.waitForTimeout(200);
await page.goto(URL);
await page.waitForTimeout(400);
const h2 = await page.evaluate(() => JSON.parse(localStorage.getItem('mf_hist_A') || '[]'));
ok('中途離開會記成作廢', h2.length === 2 && h2[0].void === true, h2[0]);
ok('重新進來有提示', (await page.textContent('#home')).includes('作廢'));

// ───────── 其他考卷（B／C）─────────
const others = await page.evaluate(() => {
  const out = {};
  ['B', 'C'].forEach(id => {
    const p = PAPERS[id];
    out[id] = p && p.sections ? {
      n: p.sections.reduce((a, s) => a + s.n, 0),
      secs: p.sections.map(s => s.n),
      bad: p.sections.flatMap(s => s.parts.flatMap(part => part.items.filter(it =>
        !(it.c.length === 3 || it.c.length === 4) || !(it.a >= 0 && it.a < it.c.length)
        || new Set(it.c).size !== it.c.length || !it.e || it.e.length < 40
        || (s.key === 'choukai' && !(it.play && it.play.length))).map(() => part.title))),
      noClip: p.sections.filter(s => s.key === 'choukai').flatMap(s => [
        ...(s.opening ? [['N', s.opening]] : []), ...(s.closing ? [['N', s.closing]] : []),
        ...s.parts.flatMap(part => [['N', part.instr],
          ...(part.ex ? part.ex.play : []).filter(l => !l.p).map(l => [l.r, l.t]),
          ...part.items.flatMap(it => it.play.filter(l => !l.p).map(l => [l.r, l.t]))])
      ]).filter(([r, t]) => !SAY[r + '|' + t]).length,
    } : null;
  });
  return out;
});
for (const id of ['B', 'C']){
  const o = others[id];
  if (!o){ console.log('SKIP  ' + id + ' 卷還沒有內容'); continue; }
  ok(id + ' 卷 67 題、三科 21/22/24', o.n === 67 && JSON.stringify(o.secs) === '[21,22,24]', o.secs);
  ok(id + ' 卷每題結構正確', o.bad.length === 0, o.bad.slice(0, 5));
  ok(id + ' 卷聴解每一行都有 clip', o.noClip === 0, o.noClip);
  await page.evaluate(i => renderHome(), id);
  ok(id + ' 卷在選卷頁上可以開始', await page.locator('[data-start="' + id + '"]').count() === 1);
}

// ───────── 版面 ─────────
const over = [];
for (const w of [320, 390, 768, 1280]){
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(150);
  const s = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (s > 2) over.push(w + 'px 溢出 ' + s);
}
ok('320/390/768/1280 無橫向溢出', over.length === 0, over);
ok('無 console 錯誤', errs.length === 0, errs.slice(0, 3));

await browser.close();
console.log(fail ? ('\n' + fail + ' 項 FAIL') : '\n全部 PASS');
process.exit(fail ? 1 : 0);
