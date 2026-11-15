// Worker 驗證（不用真的連 Google）：假的 fetch 冒充 Google 的 token 與 GA API，
// 檢查密碼、CORS、日期檢查、JWT 簽章真的驗得過、查詢內容正確、回傳攤平。執行：node test.mjs
import { generateKeyPairSync, createVerify } from 'node:crypto';
import worker from './src/index.js';

const checks = [];
const ok = (name, cond, info) => { checks.push([name, !!cond]); if (!cond && info !== undefined) console.log('  ↳', JSON.stringify(info).slice(0, 400)); };

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  GA_PROPERTY: '559817851',
  ALLOWED_ORIGINS: 'https://robinybwang.github.io',
  STATS_PASSWORD: 'correct horse battery',
  GA_KEY: JSON.stringify({ client_email: 'stats@test.iam.gserviceaccount.com',
                           private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
};

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: init.body });
  if (url === 'https://oauth2.googleapis.com/token') {
    const jwt = new URLSearchParams(init.body).get('assertion');
    const [h, p, s] = jwt.split('.');
    const v = createVerify('RSA-SHA256'); v.update(h + '.' + p);
    const good = v.verify(publicKey, Buffer.from(s, 'base64url'));
    const claims = JSON.parse(Buffer.from(p, 'base64url'));
    calls.at(-1).jwt = { good, claims };
    return new Response(JSON.stringify(good ? { access_token: 'tok', expires_in: 3600 } : { error: 'invalid_grant' }), { status: good ? 200 : 400 });
  }
  const q = JSON.parse(init.body);
  return new Response(JSON.stringify({
    dimensionHeaders: (q.dimensions || []).map(d => ({ name: d.name })),
    metricHeaders: (q.metrics || []).map(m => ({ name: m.name })),
    rows: [{ dimensionValues: (q.dimensions || []).map((d, i) => ({ value: 'v' + i })),
             metricValues: (q.metrics || []).map((m, i) => ({ value: String(i + 1) })) }],
  }), { status: 200 });
};

const ask = (body, origin = 'https://robinybwang.github.io', method = 'POST') =>
  worker.fetch(new Request('https://w.test/', { method, headers: { Origin: origin, 'Content-Type': 'application/json' },
                                                body: method === 'POST' ? JSON.stringify(body) : undefined }), env);

// 預檢與 CORS
let r = await ask(null, 'https://robinybwang.github.io', 'OPTIONS');
ok('OPTIONS 預檢回 204、放行自己的網站', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://robinybwang.github.io');
r = await ask(null, 'https://evil.example', 'OPTIONS');
ok('別的網站的 Origin 不會被放行', r.headers.get('Access-Control-Allow-Origin') !== 'https://evil.example');

// 密碼錯：401、而且要等一下才回（拖慢猜密碼）
let t0 = Date.now();
r = await ask({ password: 'nope' });
ok('密碼錯回 401', r.status === 401 && (await r.json()).error === 'wrong_password');
ok('密碼錯會拖 1 秒以上才回', Date.now() - t0 >= 1400);
ok('密碼錯時完全沒去問 Google', calls.length === 0);

// 日期亂填
r = await ask({ password: env.STATS_PASSWORD, start: '2026-11-01; drop', end: 'today' });
ok('日期格式不對回 400', r.status === 400);

// 正確密碼
r = await ask({ password: env.STATS_PASSWORD, start: '2026-11-01', end: 'yesterday' });
const data = await r.json();
const tok = calls.find(c => c.jwt);
ok('回 200', r.status === 200, data);
ok('JWT 用金鑰簽章、Google 端驗得過', tok && tok.jwt.good);
ok('JWT 只要求 GA 唯讀權限、發給服務帳號', tok && tok.jwt.claims.scope === 'https://www.googleapis.com/auth/analytics.readonly'
   && tok.jwt.claims.iss === 'stats@test.iam.gserviceaccount.com' && tok.jwt.claims.exp - tok.jwt.claims.iat === 3600);
const ga = calls.filter(c => c.url.startsWith('https://analyticsdata.googleapis.com/v1beta/properties/559817851:'));
ok('問了 GA 六次（即時 3、報表 3）', ga.filter(c => c.url.endsWith(':runRealtimeReport')).length === 3 && ga.filter(c => c.url.endsWith(':runReport')).length === 3);
// GA 規定：即時報表的頁面名稱不能跟事件名稱一起查（2026-11-15 實際被拒過）
const rt = ga.filter(c => c.url.endsWith(':runRealtimeReport')).map(c => (JSON.parse(c.body).dimensions || []).map(d => d.name));
ok('即時查詢沒有把 unifiedScreenName 跟 eventName 放在一起', rt.every(d => !(d.includes('unifiedScreenName') && d.includes('eventName'))), rt);
const examQ = ga.map(c => JSON.parse(c.body)).find(q => q.dimensionFilter && q.dimensionFilter.filter.stringFilter);
ok('考試查詢只抓 exam_ 開頭的事件、帶日期範圍', examQ && examQ.dimensionFilter.filter.stringFilter.value === 'exam_'
   && examQ.dateRanges[0].startDate === '2026-11-01' && examQ.dateRanges[0].endDate === 'yesterday');
ok('考試查詢不超過 GA 上限（維度 9、指標 10）', examQ && examQ.dimensions.length <= 9 && examQ.metrics.length <= 10);
ok('回傳攤平成 {欄位: 值}，customEvent: 前綴拿掉、數字轉數字', data.exams && data.exams[0].paper === 'v4' && data.exams[0].score === 2 && data.days[0].activeUsers === 1, data.exams);
ok('回傳帶日期範圍與六組資料', data.start === '2026-11-01' && ['now', 'nowPages', 'nowEvents', 'days', 'exams', 'pages'].every(k => Array.isArray(data[k])));

// token 重複使用
const before = calls.filter(c => c.jwt).length;
await ask({ password: env.STATS_PASSWORD });
ok('第二次查詢沿用 token、不重新簽', calls.filter(c => c.jwt).length === before);

// 某個查詢被 GA 拒絕：那一組回 {error}，其他照常（token 已經快取，不會再去要）
globalThis.fetch = async (url, init) => /runRealtimeReport/.test(url) && /unifiedScreenName/.test(init.body)
  ? new Response(JSON.stringify({ error: { message: 'cannot be queried together' } }), { status: 400 })
  : new Response(JSON.stringify({ rows: [] }), { status: 200 });
r = await ask({ password: env.STATS_PASSWORD });
const part = await r.json();
ok('單一查詢失敗：整體仍回 200，那一組帶原因、其他照常', r.status === 200 && /queried together/.test(part.nowPages.error) && Array.isArray(part.exams), part);

// 換不到 token（金鑰錯）：整個失敗回 502（重新載入模組，清掉快取的 token）
const fresh = (await import('./src/index.js?fresh')).default;
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
r = await fresh.fetch(new Request('https://w.test/', { method: 'POST', headers: { Origin: 'https://robinybwang.github.io' },
                                                      body: JSON.stringify({ password: env.STATS_PASSWORD }) }), env);
ok('金鑰換不到 token 回 502 並帶原因', r.status === 502 && /invalid_grant/.test((await r.json()).detail));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; }
console.log(fail ? '\n' + fail + ' 項 FAIL' : '\n全部 PASS');
process.exit(fail ? 1 : 0);
