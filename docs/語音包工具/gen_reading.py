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


# 第6課：を（受詞）／〜を します／何を しますか／疑問詞＋も＋否定／疑問詞＋でも＋肯定。
# 受詞按動詞分組（隨機配會生出「机を 食べます」）；名詞順便複習第2〜5課。
BUY6 = ['車', '本', 'かばん', '靴', 'パン', '新聞', '果物']
MEDIA6 = ['テレビ', '映画', '写真', 'ビデオ']
FOOD6 = ['ごはん', 'パン', '肉', '魚', '野菜', '果物', '卵', '朝ごはん', 'ケーキ']
DRINK6 = ['コーヒー', '水', 'お茶', '紅茶', '牛乳', 'ジュース', 'ビール']
READ6 = ['本', '新聞', '雑誌', '手紙']
DOIT6 = ['宿題', 'テニス', 'サッカー', '会議', '残業', 'お花見']
WHEN6_F = ['明日', '週末', '今日', '日曜日']
WHEN6_P = ['昨日', '先週', 'おととい']
SHOP6 = ['デパート', 'スーパー', '駅', 'あの店']
EATPL6 = ['食堂', 'レストラン', '喫茶店', '家']
INVITE6 = ['京都へ 行き', 'お花見を し', 'お茶を 飲み', '昼ごはんを 食べ', '映画を 見', 'テニスを し']
# ⑪ そして／それから（2026-09-20 上課筆記）
DAY6 = ['土よう日', '日よう日', '金よう日']
PLACE6 = ['デパート', '公園', '図書館', '喫茶店', '映画館']
FOOD6B = ['パスタ', 'ごはん', 'ケーキ', 'パン', '昼ごはん', '晩ごはん']   # 正餐；食材（魚・肉）接在「そして〜を 食べました」後面會很怪


def rtmpl6(rows, rng):
    c = rng.choice
    # 一套 22 行：從頭依序取，取到 22 行為止（後面的樣板輪不到，所以用 c([...]) 把同類句合併成一格）。
    # 「何でも」引擎會唸成ナニデモ，句子直接寫假名 なんでも。

    def invite2():   # 邀請＋回應：ましょう 的動詞要跟邀請句同一個
        inv = c(INVITE6)
        v = inv.split(' ')[-1]
        return ['A: いっしょに ' + inv + 'ませんか。', 'B: ' + c(['すみません、ちょっと…。', 'ええ、' + v + 'ましょう。'])]
    return [
        lambda: ['A: ' + c(WHEN6_F) + ' 何を しますか。', 'B: ' + c(DOIT6) + 'を します。'],
        lambda: ['A: ' + c(WHEN6_P) + ' 何を しましたか。', 'B: ' + c(MEDIA6) + 'を 見ました。'],
        lambda: ['A: 何を 食べますか。', 'B: ' + c(FOOD6) + 'を 食べます。'],
        lambda: ['A: 何を 飲みますか。', 'B: ' + c(DRINK6) + 'を 飲みます。'],
        lambda: [c(WHEN6_P) + ' ' + c(SHOP6) + 'で ' + c(BUY6) + 'を 買いました。'],
        lambda: ['A: どこで 昼ごはんを 食べますか。', 'B: ' + c(EATPL6) + 'で 食べます。'],
        lambda: ['A: いっしょに ' + c(INVITE6) + 'ませんか。', 'B: ええ、いいですね。'],
        invite2,
        lambda: [c(['あそこで 休みましょう。', '食堂へ 行きましょう。', '3時に 会いましょう。', 'じゃ、また あした。'])],
        lambda: c([['毎日 ' + c(DRINK6) + 'を 飲みます。'], ['私は ' + c(READ6) + 'を 読みます。'], ['音楽を 聞きます。'],
                   ['手紙を 書きます。'], ['写真を 撮ります。'], ['たばこを 吸いません。']]),
        lambda: ['A: 日本語を 勉強しますか。', 'B: はい、勉強します。'],
        lambda: c([['私は 何も 食べません。'], [c(WHEN6_P) + ' 何も 食べませんでした。'], [c(WHEN6_F) + ' どこへも 行きません。']]),
        lambda: c([['私は なんでも 食べます。'], ['誰でも 分かります。']]),
        lambda: [c(DAY6) + 'は 家族と ' + c(PLACE6) + 'へ 行きました。', 'そして ' + c(FOOD6B) + 'を 食べました。'],
        lambda: ['部屋を 掃除しました。', 'それから アニメを 見ました。'],
        lambda: ['A: 週末 何を しましたか。', 'B: ' + c(DAY6) + 'は ' + c(PLACE6) + 'へ 行きました。'],
        lambda: c([['夜は 家で 日本語を 勉強しました。'], ['朝ごはんを 食べます。それから 会社へ 行きます。'],
                   ['誰も 来ません。'], ['友達に 会います。']]),
        lambda: ['A: 分かりますか。', 'B: いいえ、分かりません。'],
    ]


TMPL = {'4': rtmpl4, '5': rtmpl5, '6': rtmpl6}


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
