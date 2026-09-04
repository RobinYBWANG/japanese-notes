# gen_reading.py —— 重產某一課的「朗讀套組」（寫進 vv-data 的 reading）
#
# **朗讀的唯一來源就是這支**（2026-08-30 查證）：頁面的 genReadingText() 只從 vv-data.reading
# 取預錄套組，連「🔄 從該課單字產生」按鈕也是換一套預錄的。
# HTML 裡那些 rtmpl1..5 / buildReading1..4 的 JS 是死碼，沒有任何地方呼叫，改它不會有效果。
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


# 第5課：へ（方向）／で（手段）／何で・どこへ／人數＋で。
# 目的地刻意用到第3・4課的場所（使用者要求：順便複習前幾課）。
DEST5 = ['学校', '塾', '実家', '会社', '駅', '銀行', '郵便局', '図書館', '映画館', '動物園',
         'デパート', 'スーパー', '本屋', 'レストラン', '喫茶店', 'ホテル', '空港', 'プール', '公園']
TRIDE5 = ['電車', 'バス', 'タクシー', '地下鉄']
TBIKE5 = ['自転車', 'バイク']
CITY5 = ['ニューヨーク', 'ペキン', 'ロサンゼルス', 'ロンドン']
# 同樣要分時態（舊版會產生「明日 〜へ 行きました」）
WHEN5_F = ['明日', '週末', 'あとで', '今日']
WHEN5_P = ['昨日', '先週', 'おととい']
NINZU5 = ['2人', '3人', '4人']


def rtmpl5(rows, rng):
    d = lambda: rng.choice(DEST5)
    return [
        lambda: ['A: 明日 どこへ 行きますか。', 'B: ' + d() + 'へ 行きます。'],
        lambda: ['A: 何で 行きますか。', 'B: ' + rng.choice(TRIDE5) + 'で 行きます。'],
        lambda: (lambda x: ['A: あなたは 何で ' + x + 'へ 来ましたか。',
                            'B: ' + rng.choice(TBIKE5) + 'で 来ました。'])(d()),
        lambda: [rng.choice(WHEN5_P) + ' ' + d() + 'へ 行きました。'],
        lambda: [rng.choice(WHEN5_F) + ' ' + d() + 'へ 行きます。'],
        lambda: ['お正月に 実家へ 帰ります。'],
        lambda: [rng.choice(NINZU5) + 'で ' + d() + 'へ 行きます。'],
        lambda: ['歩いて ' + d() + 'へ 行きます。'],
        lambda: ['飛行機で ' + rng.choice(CITY5) + 'へ 行きます。'],
        lambda: ['A: 全部で いくらですか。', 'B: 全部で ' + rng.choice(['3000', '5000', '8000']) + '円です。'],
        lambda: ['一人で 帰りました。'],
        lambda: ['A: 週末 どこへ 行きましたか。', 'B: ' + d() + 'へ 行きました。'],
        lambda: ['みんなで ' + d() + 'へ 行きます。'],
    ]


TMPL = {'4': rtmpl4, '5': rtmpl5}


def build_total(VV, rng, nset=2, target=150):
    """朗讀總表（第99套）＝ 把各課已產好的朗讀輪流抽出來混合。
    這樣每一行都已經有音檔，而且保證每一課都被涵蓋
    （2026-08-23 稽核時，舊的第99套還留著「6時から 4時までです」這種時間倒著走的句子）。
    以「A: 問／B: 答」為一個區塊，不會把對話拆散。"""
    def blocks(text):
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        out, i = [], 0
        while i < len(lines):
            if lines[i].startswith('A:') and i + 1 < len(lines) and lines[i + 1].startswith('B:'):
                out.append(lines[i:i + 2])
                i += 2
            else:
                out.append([lines[i]])
                i += 1
        return out

    per = {}
    for k in sorted(VV.get('reading', {})):
        if k == '99':
            continue
        bs = []
        for t in VV['reading'][k]:
            bs += blocks(t)
        if bs:
            per[k] = bs
    assert per, '沒有任何課的朗讀可以拿來混合'
    sets = []
    for s_i in range(nset):
        lines, used = [], set()
        idx = {k: s_i for k in per}
        guard = 0
        while len(lines) < target and guard < 400:
            for k in sorted(per):
                if len(lines) >= target:
                    break
                bs = per[k]
                for _ in range(len(bs)):
                    blk = bs[idx[k] % len(bs)]
                    idx[k] += 1
                    key = '|'.join(blk)
                    if key not in used:
                        used.add(key)
                        lines += blk
                        break
            guard += 1
        sets.append('\n'.join(lines))
    return sets

h = open(HTML, encoding='utf-8').read()
vd = json.loads(re.search(r'<script[^>]*id="vocab-data"[^>]*>(.*?)</script>', h, re.S).group(1))
m = re.search(r'(<script[^>]*id="vv-data"[^>]*>)(.*?)(</script>)', h, re.S)
VV = json.loads(m.group(2))

rng = random.Random(SEED)
if LES == '99':
    sets = build_total(VV, rng, NSET if len(sys.argv) > 2 else 2)
else:
    assert LES in TMPL, '第%s課還沒有朗讀樣板' % LES
    rows = vd['lessons'].get(LES, [])
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
