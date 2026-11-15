/* 網站統計 Worker：stats.html 送密碼與日期範圍過來，這裡用服務帳號金鑰去問 GA Data API，把結果原樣回傳。
   金鑰與密碼放在 Cloudflare 的 Secrets（GA_KEY、STATS_PASSWORD），不在原始碼裡。
   只跑下面這幾個固定查詢（即時 3 個、報表 3 個），不接受任意查詢，所以密碼外洩頂多被看到統計數字。2026-11-15 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://analyticsdata.googleapis.com/v1beta/properties/';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const WRONG_PW_DELAY_MS = 1500;   // 密碼錯就拖一下，猜密碼變慢

let cachedToken = null;   // {token, exp}：同一個 Worker 實例內重複使用，不用每次重簽

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req.headers.get('Origin') || '', env.ALLOWED_ORIGINS || '');
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (req.method !== 'POST') return json({error: 'method'}, 405, cors);

    let body;
    try { body = await req.json(); } catch (e) { return json({error: 'bad_request'}, 400, cors); }
    if (!env.STATS_PASSWORD || !(await sameText(String(body.password || ''), env.STATS_PASSWORD))) {
      await new Promise(r => setTimeout(r, WRONG_PW_DELAY_MS));
      return json({error: 'wrong_password'}, 401, cors);
    }
    const start = body.start || '7daysAgo', end = body.end || 'today';
    if (!isDate(start) || !isDate(end)) return json({error: 'bad_range'}, 400, cors);

    try {
      const token = await googleToken(env.GA_KEY);
      /* 每個查詢各自接錯：哪一個被 GA 拒絕，就在那一欄回 {error}，其他照常 */
      const run = (kind, q) => gaQuery(env.GA_PROPERTY, kind, q, token).catch(e => ({error: String(e.message || e).slice(0, 300)}));
      const range = [{startDate: start, endDate: end}];
      /* 即時報表的頁面名稱不能跟事件名稱一起查（GA 規定），所以拆成兩個 */
      const [now, nowPages, nowEvents, days, exams, pages] = await Promise.all([
        run('runRealtimeReport', {metrics: [{name: 'activeUsers'}]}),
        run('runRealtimeReport', {
          dimensions: [{name: 'unifiedScreenName'}, {name: 'minutesAgo'}, {name: 'deviceCategory'}],
          metrics: [{name: 'activeUsers'}], limit: 1000}),
        run('runRealtimeReport', {
          dimensions: [{name: 'eventName'}, {name: 'minutesAgo'}, {name: 'deviceCategory'}],
          metrics: [{name: 'eventCount'}], limit: 1000}),
        run('runReport', {dateRanges: range, dimensions: [{name: 'date'}],
          metrics: [{name: 'activeUsers'}, {name: 'newUsers'}, {name: 'sessions'}], limit: 400}),
        run('runReport', {dateRanges: range,
          dimensions: ['dateHourMinute', 'eventName', 'deviceCategory', 'customEvent:exam_type', 'customEvent:paper',
                       'customEvent:section', 'customEvent:passed', 'customEvent:answered_band', 'customEvent:skipped'].map(name => ({name})),
          metrics: ['eventCount', 'customEvent:score', 'customEvent:score_lang', 'customEvent:score_listen', 'customEvent:answered',
                    'customEvent:correct', 'customEvent:seconds', 'customEvent:answered_total', 'customEvent:total_seconds'].map(name => ({name})),
          dimensionFilter: {filter: {fieldName: 'eventName', stringFilter: {matchType: 'BEGINS_WITH', value: 'exam_'}}},
          limit: 5000}),
        run('runReport', {dateRanges: range,
          dimensions: [{name: 'dateHour'}, {name: 'eventName'}, {name: 'pageTitle'}, {name: 'deviceCategory'}],
          metrics: [{name: 'eventCount'}],
          dimensionFilter: {filter: {fieldName: 'eventName', inListFilter: {values: ['page_view', 'still_here']}}},
          limit: 5000}),
      ]);
      return json({start, end, now, nowPages, nowEvents, days, exams, pages}, 200, cors);
    } catch (e) {
      return json({error: 'ga_failed', detail: String(e && e.message || e).slice(0, 300)}, 502, cors);
    }
  }
};

/* 只放行自己的網站；本機測試時 file:// 的 Origin 是 "null"，localhost 也放行（反正還要密碼） */
function corsHeaders(origin, allowed) {
  const ok = allowed.split(',').map(s => s.trim()).filter(Boolean).includes(origin)
          || origin === 'null' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://robinybwang.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {status, headers: {...headers, 'Content-Type': 'application/json; charset=utf-8'}});
}

/* GA 接受的日期：YYYY-MM-DD、today、yesterday、NdaysAgo */
function isDate(s) {
  return typeof s === 'string' && /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d{1,3}daysAgo)$/.test(s);
}

/* 比對密碼：先各自做 SHA-256 再逐位元比，花的時間跟哪裡不同無關 */
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

async function gaQuery(property, kind, query, token) {
  const r = await fetch(API + property + ':' + kind, {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify(query),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(kind + ' ' + r.status + ' ' + (data.error && data.error.message || ''));
  return rows(data);
}

/* GA 回傳的 {dimensionHeaders, metricHeaders, rows} 攤平成 [{欄位名: 值}]，數字欄轉成數字 */
function rows(data) {
  const dn = (data.dimensionHeaders || []).map(h => h.name.replace(/^customEvent:/, ''));
  const mn = (data.metricHeaders || []).map(h => h.name.replace(/^customEvent:/, ''));
  return (data.rows || []).map(r => {
    const o = {};
    (r.dimensionValues || []).forEach((v, i) => { o[dn[i]] = v.value; });
    (r.metricValues || []).forEach((v, i) => { o[mn[i]] = Number(v.value); });
    return o;
  });
}

/* 服務帳號金鑰（JSON）→ 簽一張 JWT → 換 OAuth access token（只有讀取 GA 的權限） */
async function googleToken(keyJson) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const key = JSON.parse(keyJson);
  const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = enc({alg: 'RS256', typ: 'JWT'}) + '.' +
                   enc({iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600});
  const der = Uint8Array.from(atob(key.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const pk = await crypto.subtle.importKey('pkcs8', der, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(unsigned));
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + b64url(new Uint8Array(sig)),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error('token ' + r.status + ' ' + (data.error_description || data.error || ''));
  cachedToken = {token: data.access_token, exp: now + (data.expires_in || 3600)};
  return cachedToken.token;
}

function b64url(bytes) {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
