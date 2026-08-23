# gen_reading.py —— 重產某一課的「朗讀套組」（寫進 vv-data 的 reading）
#
# 朗讀有兩條路：
#   ① 頁面上按「🔄 從該課單字產生」 → 走 HTML 裡的 JS rtmpl，即時產生、用 TTS 唸。
#   ② 平常看到的朗讀 → 是這支預先產好、存在 vv-data.reading 裡的套組，有預錄音檔。
# 兩邊的樣板必須一致，改了 JS 就要改這裡（反之亦然），否則兩條路唸出來的內容會不一樣。
#
# 執行：python gen_reading.py 4 [套組數，預設 3]
#   之後要跑 本機補音檔.py 補新句子的音檔。
#
import json, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.normpath(os.path.join(HERE, '..', 'minna-notes.html'))
LES = sys.argv[1] if len(sys.argv) > 1 else '4'
NSET = int(sys.argv[2]) if len(sys.argv) > 2 else 3
SEED = 20260823        # 固定種子：同樣的輸入產出同樣的套組，diff 才看得懂

DAYS = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日']
EV = ['会議', '試験', '昼休み', '映画']
# 動詞要配對句型（跟 HTML 裡的 rtmpl4 同一套規則）
POINT_W = ['起きます', '寝ます', '出発します']
DUR_W = ['働きます', '勉強します', '飲みます', '休みます']


def rtmpl4(rows, rng):
    V = [r for r in rows if (r.get('kana') or '').endswith('ます') and r.get('word')]
    if len(V) < 2:
        return []
    pick = lambda ns: [r for r in V if r['word'] in ns] or V
    POINT, DUR = pick(POINT_W), pick(DUR_W)
    cj = lambda r, suf: re.sub(r'ます$', '', r['word']) + suf
    hr = lambda: 1 + rng.randrange(11)
    hr2 = lambda a: a + 1 + rng.randrange(max(1, 12 - a))

    def t_now():
        h, m, ap = hr(), rng.randrange(60), rng.random() < 0.5
        return ['A: 今 何時ですか。', 'B: ' + ('午前' if ap else '午後') + ' ' + str(h) + '時' + (str(m) + '分' if m else '') + 'です。']

    def t_bank():
        a = hr(); b = hr2(a)
        return ['A: 銀行は 何時から 何時までですか。', 'B: ' + str(a) + '時から ' + str(b) + '時までです。']

    def t_event():
        e, a = rng.choice(EV), hr(); b = hr2(a)
        return ['A: ' + e + 'は 何時から 何時までですか。', 'B: ' + str(a) + '時から ' + str(b) + '時までです。']

    def t_askwhen():
        r, h = rng.choice(POINT), hr()
        return ['A: 昨日 何時に ' + cj(r, 'ましたか') + '。', 'B: ' + str(h) + '時に ' + cj(r, 'ました') + '。']

    def t_yesno():
        r = rng.choice(DUR)
        return ['A: 今日 ' + cj(r, 'ますか') + '。', 'B: いいえ、' + cj(r, 'ません') + '。']

    return [
        t_now,
        lambda: ['A: 今日は 何曜日ですか。', 'B: ' + rng.choice(DAYS) + 'です。'],
        t_bank,
        t_event,
        lambda: ['毎日 ' + str(hr()) + '時に ' + cj(rng.choice(POINT), 'ます') + '。'],
        t_askwhen,
        lambda: ['昨日 ' + cj(rng.choice(DUR), 'ました') + '。'],
        t_yesno,
        lambda: [rng.choice(DAYS) + 'は ' + cj(rng.choice(DUR), 'ません') + '。'],
        lambda: ['昨日 ' + str(hr()) + '時まで 残業しました。'],
        lambda: ['A: 休みは 何曜日ですか。', 'B: 休みは 土曜日と 日曜日です。'],
        lambda: ['A: 大変ですね。', 'B: そうですね。'],
    ]


TMPL = {'4': rtmpl4}

h = open(HTML, encoding='utf-8').read()
vd = json.loads(re.search(r'<script[^>]*id="vocab-data"[^>]*>(.*?)</script>', h, re.S).group(1))
m = re.search(r'(<script[^>]*id="vv-data"[^>]*>)(.*?)(</script>)', h, re.S)
VV = json.loads(m.group(2))

assert LES in TMPL, '第%s課還沒有朗讀樣板' % LES
rows = vd['lessons'].get(LES, [])
rng = random.Random(SEED)
T = TMPL[LES](rows, rng)
assert T, '第%s課沒有足夠的單字' % LES

sets = []
for s in range(NSET):
    lines = []
    guard = 0
    while len(lines) < 22 and guard < 25:      # 一套約 22 行
        for f in T:
            if len(lines) >= 22:
                break
            lines += f()
        guard += 1
    sets.append('\n'.join(lines))

old = VV.get('reading', {}).get(LES, [])
VV.setdefault('reading', {})[LES] = sets
out = h[:m.start(2)] + json.dumps(VV, ensure_ascii=False) + h[m.end(2):]
fd = os.open(HTML, os.O_WRONLY | os.O_TRUNC)
os.write(fd, out.encode('utf-8'))
os.fsync(fd)
os.close(fd)

print('第%s課朗讀：%d 套 → %d 套' % (LES, len(old), len(sets)))
print('每套 %d 行；不重複句子 %d 句' % (len(sets[0].split('\n')),
                                len({ln for s in sets for ln in s.split('\n')})))
print('\n--- 第 1 套 ---')
print(sets[0])
print('\n提醒：跑 本機補音檔.py 補新句子的音檔。')
