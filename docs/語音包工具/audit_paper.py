# -*- coding: utf-8 -*-
"""正式版模擬考的考卷體檢：題目結構、和簡易考撞題、圖片、音檔、唸法、文章與空格對應。
   執行：python3 audit_paper.py [A|B|C]（預設 A）。引擎沒開時會跳過唸法檢查。
   新做一份考卷之後一定要跑這支，再跑 test_mockfull.mjs。"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request

PID = (sys.argv[1] if len(sys.argv) > 1 else 'A').upper()
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
HTML = os.path.join(ROOT, 'docs/n5-mock-full.html')
AUD = os.path.join(ROOT, 'docs/audio/mockfull')
BASE = 'http://127.0.0.1:50021'
K2H = {chr(c): chr(c - 0x60) for c in range(0x30A1, 0x30F7)}

h = open(HTML, encoding='utf-8').read()
P = json.loads(re.search(r'<script id="paper-%s" type="application/json">(.*?)</script>' % PID, h, re.S).group(1))
assert P.get('sections'), '%s 卷還沒有內容' % PID
print('—— %s 卷體檢 ——' % PID)
SAY = json.loads(re.search(r'<script id="mf-say" type="application/json">(.*?)</script>', h, re.S).group(1))
bad = []


def B(tag, msg):
    bad.append('%-22s %s' % (tag, msg))


# ── 1. 結構 ──
qs, seen_q = [], {}
for sec in P['sections']:
    for part in sec['parts']:
        for i, it in enumerate(part['items'], 1):
            tag = '%s/%s#%d' % (sec['key'], part['title'].split('　')[0], i)
            qs.append((tag, sec, part, it))
            if not (3 <= len(it['c']) <= 4):
                B(tag, '選項數 %d' % len(it['c']))
            if not (0 <= it['a'] < len(it['c'])):
                B(tag, '正解索引 %d' % it['a'])
            if len(set(it['c'])) != len(it['c']):
                B(tag, '選項重複 %s' % it['c'])
            if not it.get('e') or len(it['e']) < 40:
                B(tag, '解說太短')
            key = re.sub(r'<[^>]+>', '', it['q']) + '|' + '|'.join(it['c'])
            if key in seen_q:
                B(tag, '和 %s 完全同題' % seen_q[key])
            seen_q[key] = tag
            if sec['key'] == 'choukai':
                if not it.get('play'):
                    B(tag, '沒有 play')
                if 'zh' not in it:
                    B(tag, '沒有中文翻譯')
            else:
                if it.get('play'):
                    B(tag, '非聴解卻有 play')
print('題數 %d（應為 67）' % len(qs))

# ── 2. 和簡易考的題庫不能重疊 ──
eh = open(os.path.join(ROOT, 'docs/n5-mock-easy.html'), encoding='utf-8').read()
i = eh.index('var BANK = ['); j = eh.index('\n];\n', i)
tmp = '/tmp/_ebank.js'
open(tmp, 'w', encoding='utf-8').write(eh[i:j + 3])
EB = json.loads(subprocess.run(['node', '-e',
    'const fs=require("fs");const BANK=eval(fs.readFileSync(process.argv[1],"utf8").replace(/^var BANK = /,""));'
    'process.stdout.write(JSON.stringify(BANK))', tmp], capture_output=True, text=True, check=True).stdout)
eq = {re.sub(r'<[^>]+>', '', q['q']).strip() for q in EB}
# JLPT 的制式題幹本來就會重複出現，不算撞題
BOILER = {'何と 言いますか。', '（へんじを えらんで ください）',
          '男の人は これから 何を しますか。', '女の人は これから 何を しますか。',
          '女の人は まず 何を しますか。', 'この 人は 来年 何を したいですか。'}
el = {l['t'] for q in EB if q.get('audio') for l in q['audio']}
for tag, sec, part, it in qs:
    t = re.sub(r'<[^>]+>', '', it['q']).strip()
    if t and t in eq and len(t) > 8 and t not in BOILER:
        B(tag, '題幹和簡易考一樣：' + t[:24])
    for l in it.get('play', []):
        if l.get('t') in el and len(l.get('t', '')) > 14 and not l['t'].endswith('ございます。'):
            B(tag, '對白和簡易考一樣：' + l['t'][:22])

# ── 3. 圖片 ──
imgs = []
for tag, sec, part, it in qs:
    for p in (it.get('img'), it.get('scene')):
        if p:
            imgs.append((tag, p))
            if not os.path.exists(os.path.join(ROOT, 'docs', p)):
                B(tag, '圖片不存在 ' + p)
dup = {}
for tag, p in imgs:
    dup.setdefault(p, []).append(tag)
for p, tags in dup.items():
    if len(tags) > 1:
        B('圖片', '%s 被 %s 共用' % (p, tags))
# 例題的圖不能和正式題撞
for sec in P['sections']:
    for part in sec['parts']:
        ex = part.get('ex') or {}
        for p in (ex.get('img'), ex.get('scene')):
            if p and p in dup:
                B('例題', '%s 的例題圖和正式題 %s 相同' % (part['title'], dup[p]))
print('圖片 %d 張（不重複 %d）' % (len(imgs), len(dup)))

# ── 4. 音檔：clip 齊全、檔案存在、長度合理 ──
need = []
for sec in P['sections']:
    if sec['key'] != 'choukai':
        continue
    if sec.get('opening'):
        need.append(('N', sec['opening']))
    if sec.get('closing'):
        need.append(('N', sec['closing']))
    for part in sec['parts']:
        need.append(('N', part['instr']))
        for l in (part.get('ex') or {}).get('play', []):
            if 'p' not in l:
                need.append((l['r'], l['t']))
        for it in part['items']:
            for l in it['play']:
                if 'p' not in l:
                    need.append((l['r'], l['t']))
need = list(dict.fromkeys(need))
durs = {}
for r, t in need:
    cid = SAY.get(r + '|' + t)
    if not cid:
        B('音檔', '沒有 clip：%s|%s' % (r, t[:24])); continue
    f = os.path.join(AUD, cid + '.ogg')
    if not os.path.exists(f):
        B('音檔', '檔案不存在 %s（%s）' % (cid, t[:20])); continue
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                              '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip() or 0)
    durs[(r, t)] = d
    if d < 0.5:
        B('音檔', '太短 %.2f 秒：%s' % (d, t[:24]))
    if d / max(1, len(t)) > 0.9:
        B('音檔', '異常長 %.1f 秒 / %d 字：%s' % (d, len(t), t[:24]))
orphan = [k for k in SAY if tuple(k.split('|', 1)) not in set(need)]
if orphan:
    B('音檔', '多餘的 clip %d 個' % len(orphan))
print('音檔文本 %d 個；總長 %.1f 分鐘' % (len(need), sum(durs.values()) / 60))

# ── 5. 唸法：拿引擎的 moras 對一次，抓漢字被唸錯 ──
RISK = {'日本': 'にほん', '十分': 'じゅっぷん', '何で ': 'なにで', '一杯': 'いっぱい', '一つ': 'ひとつ', '二十分': 'にじゅっぷん',
        '八時': 'はちじ', '七時': 'しちじ', '九時': 'くじ', '六時': 'ろくじ', '三時': 'さんじ',
        '四百円': 'よんひゃくえん', '千二百円': 'せんにひゃくえん'}


READ_FIX = [('何ですか', 'なんですか'), ('何で', 'なにで'), ('十分', 'じゅっぷん'),
            ('日本語', 'にほんご'), ('日本', 'にほん')]


def moras(t):
    for a, b in READ_FIX:
        t = t.replace(a, b)
    q = urllib.parse.urlencode({'text': t, 'speaker': 2})
    try:
        d = json.loads(urllib.request.urlopen(
            urllib.request.Request(BASE + '/audio_query?' + q, method='POST'), timeout=30).read())
    except Exception:
        return None
    k = ''.join(m['text'] for p in d['accent_phrases'] for m in p['moras'])
    return ''.join(K2H.get(c, c) for c in k)


checked = 0
for r, t in need:
    hits = [(w, y) for w, y in RISK.items() if w in t]
    if not hits:
        continue
    g = moras(t)
    if g is None:
        print('（引擎沒開，跳過唸法檢查）'); break
    checked += 1
    for w, y in hits:
        # 長音標記差異（えい→ええ、おう→おお）忽略
        yy = y.replace('えい', 'え').replace('おう', 'お').replace('うう', 'う')
        gg = g.replace('ええ', 'え').replace('おお', 'お').replace('うう', 'う').replace('えい', 'え').replace('おう', 'お')
        if yy.replace('え', '').replace('お', '') and y not in g and yy not in gg:
            B('唸法', '「%s」應唸 %s，實際 %s　← %s' % (w, y, g, t[:26]))
print('唸法抽查 %d 句' % checked)

# ── 6. 文章與空格 ──
for sec in P['sections']:
    for part in sec['parts']:
        groups = {}
        for it in part['items']:
            if it.get('pass'):
                groups.setdefault(it['pass'], []).append(it)
        for ps, items in groups.items():
            blanks = sorted(set(re.findall(r'【(\d+)】', ps)))
            if blanks:
                want = [str(i) for i in range(1, len(items) + 1)]
                if blanks != want:
                    B(part['title'], '空格 %s 與題數 %d 對不上' % (blanks, len(items)))
                for n, it in enumerate(items, 1):
                    if it['q'] != '【%d】' % n:
                        B(part['title'], '第 %d 題的題幹是 %s' % (n, it['q']))
            if not it.get('passZh'):
                B(part['title'], '文章沒有中文翻譯')

# ── 7. 組み立て題：正解順序要和解說裡寫的句子一致 ──
for tag, sec, part, it in qs:
    if 'class="star"' not in it.get('q', ''):
        continue
    if it['a'] != 2:
        B(tag, '★ 不在第三格（a=%d）' % it['a'])
    joined = ' '.join(it['c'])
    plain = re.sub(r'<[^>]+>', '', it['e']).replace('　', ' ')
    if joined.replace(' ', '') not in plain.replace(' ', ''):
        B(tag, '解說裡的正確語序和選項對不上')

print('\n' + ('=' * 60))
if bad:
    print('找到 %d 個問題：' % len(bad))
    for b in bad:
        print('  ✗', b)
else:
    print('沒有發現問題。')
