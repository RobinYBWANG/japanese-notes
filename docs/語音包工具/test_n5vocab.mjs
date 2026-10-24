// n5-vocab.html 回歸測試：VOICEVOX 音檔覆蓋（單一聲音 14）、點擊播的是對的檔、不會用到瀏覽器內建語音、版面
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(process.argv[2] || path.join(HERE, '..', 'n5-vocab.html'));
const AUDIO = path.join(path.dirname(HTML), 'audio', 'n5vocab');

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('dialog', d => d.dismiss());
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
// 攔截：瀏覽器內建語音一被叫就記下來；Audio.play 記下播的檔（headless 不真的播）
await page.addInitScript(() => {
  window.__tts = [];
  window.__plays = [];
  if (window.speechSynthesis) speechSynthesis.speak = u => window.__tts.push(u.text);
  HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src); return Promise.resolve(); };
});
console.log('驗證：' + HTML);
await page.goto(pathToFileURL(HTML).href, { timeout: 60000 });
await page.waitForTimeout(800);

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

const stat = await page.evaluate(() => ({ texts: Object.keys(VV.say).length, sp: VV_SPEAKER }));
ok('音檔對照表載入', stat.texts > 1500);
ok('聲音是 14', stat.sp === '14');

// 對照表裡每個 clip 檔案都在
const say = await page.evaluate(() => VV.say);
const missingFile = [];
for (const t in say)
  if (!say[t]['14'] || !fs.existsSync(path.join(AUDIO, say[t]['14'] + '.ogg'))) missingFile.push(t);
ok('每句的音檔都在', missingFile.length === 0);

// 頁面上每個發音點（單字、假名、例句）都查得到 clip
const cover = await page.evaluate(() => {
  const miss = [];
  const els = [...document.querySelectorAll('#secs [data-say]')];
  for (const el of els) {
    const k = vvNorm(el.dataset.say);
    if (!(VV.say[k] && VV.say[k][VV_SPEAKER])) miss.push(k);
  }
  return { n: els.length, miss };
});
ok('發音點數量 > 2000', cover.n > 2000);
ok('每個發音點都有音檔', cover.miss.length === 0);

// 實際點：每個發音點點一次；要播到「這句、這個聲音」的檔，而且不能叫瀏覽器內建語音
const click = await page.evaluate(() => {
  const bad = [];
  let n = 0;
  {
    const v = VV_SPEAKER;
    for (const el of document.querySelectorAll('#secs [data-say]')) {
      const before = window.__plays.length;
      el.click(); n++;
      const src = window.__plays[before] || '';
      const want = VV.say[vvNorm(el.dataset.say)][v];
      if (window.__plays.length !== before + 1 || !src.endsWith('audio/n5vocab/' + want + '.ogg')) bad.push(el.dataset.say);
    }
  }
  return { n, bad, tts: window.__tts.length };
});
ok('點擊播的是該句該聲音的檔（' + click.n + ' 次）', click.bad.length === 0);
ok('沒有用到瀏覽器內建語音', click.tts === 0);

// 手機版面：不能有橫向捲軸
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(300);
const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('手機版沒有橫向捲軸', ov <= 1);

ok('沒有錯誤或警告', errors.length === 0);

let fail = 0;
for (const [n, c] of checks) { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; }
if (missingFile.length) console.log('缺檔樣本:', missingFile.slice(0, 6));
if (cover.miss.length) console.log('缺音檔樣本:', cover.miss.slice(0, 6));
if (click.bad.length) console.log('播錯樣本:', click.bad.slice(0, 6));
if (errors.length) console.log('錯誤:', errors.slice(0, 6));
console.log(fail ? `${fail} 項失敗` : `全部 ${checks.length} 項通過`);
await browser.close();
process.exit(fail ? 1 : 0);
