// n5-grammar.html 回歸測試：VOICEVOX 音檔覆蓋（單一聲音 14，跟 n5-vocab 一樣）、點擊播的是對的檔、不會用到瀏覽器內建語音、語音設定、版面
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(process.argv[2] || path.join(HERE, '..', 'n5-grammar.html'));
const AUDIO = path.join(path.dirname(HTML), 'audio', 'n5grammar');

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

const stat = await page.evaluate(() => ({ texts: Object.keys(VV_SAY).length, sp: VV_SPEAKER }));
ok('音檔對照表載入', stat.texts > 300);
ok('聲音是 14（跟 N5 總單字一樣）', stat.sp === '14');

// 對照表裡每個 clip 檔案都在
const say = await page.evaluate(() => VV_SAY);
const missingFile = [];
for (const t in say)
  if (!say[t]['14'] || !fs.existsSync(path.join(AUDIO, say[t]['14'] + '.ogg'))) missingFile.push(t);
ok('每句的音檔都在', missingFile.length === 0);

// 頁面上每個可以點的發音點（例句 🔊、例句文字、表格裡的假名格）都查得到三個聲音的 clip
const cover = await page.evaluate(() => {
  const miss = [];
  const els = [...document.querySelectorAll('#content .say')];
  for (const el of els) {
    const k = vvNorm(cleanSay(el.textContent));
    if (!(VV_SAY[k] && VV_SAY[k][VV_SPEAKER])) miss.push(k);
  }
  return { n: els.length, miss };
});
ok('發音點數量 > 300', cover.n > 300);
ok('每個發音點都有音檔', cover.miss.length === 0);

// 實際點：每個發音點點一次；要播到「這句、這個聲音」的檔，而且不能叫瀏覽器內建語音
const click = await page.evaluate(() => {
  const bad = [];
  let n = 0;
  {
    const v = VV_SPEAKER;
    const els = [...document.querySelectorAll('#content .say, #content .spk')];
    for (const el of els) {
      const before = window.__plays.length;
      el.click(); n++;
      const src = window.__plays[before] || '';
      const jp = el.classList.contains('spk') ? el.parentElement.querySelector('.jp').textContent : el.textContent;
      const want = VV_SAY[vvNorm(cleanSay(jp))][v];
      if (window.__plays.length !== before + 1 || !src.endsWith('/audio/n5grammar/' + want + '.ogg')) bad.push(v + ':' + jp);
    }
  }
  return { n, bad, tts: window.__tts.length };
});
ok('點擊播的是該句該聲音的檔（' + click.n + ' 次）', click.bad.length === 0);
ok('沒有用到瀏覽器內建語音', click.tts === 0);

// 語音設定：只有語速（沒有聲音選單）、試聽有音檔、語速存在 n5_tts
const cfg = await page.evaluate(() => {
  document.getElementById('voicebtn').click();
  const shown = document.getElementById('voicemodal').classList.contains('show');
  const r = document.getElementById('ratein'); r.value = '1.2'; r.dispatchEvent(new Event('input'));
  const before = window.__plays.length;
  document.getElementById('vtest').click();
  const src = window.__plays[before] || '';
  const want = VV_SAY[vvNorm(cleanSay('こんにちは。日本語の練習を始めましょう。'))]['14'];
  return { shown, src, want, rate: VV_PLAYER.playbackRate, saved: JSON.parse(localStorage.getItem('n5_tts') || '{}'),
    sel: !!document.getElementById('voicesel'), pitch: !!document.getElementById('pitchin') };
});
ok('設定視窗打開', cfg.shown);
ok('沒有聲音選單、沒有音高滑桿', !cfg.sel && !cfg.pitch);
ok('試聽有播音檔', cfg.src.endsWith(cfg.want + '.ogg'));
ok('語速有套用並存起來', Math.abs(cfg.rate - 1.2) < 1e-6 && cfg.saved.rate === 1.2);

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
