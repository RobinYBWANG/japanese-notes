# gen_grammar_quiz.py —— 產生各課「文法小考」的題目，寫進 <script id="gquiz-data">
#
# 題型只有一種：**顯示中文 → 掀開看日文 → 發音**（2026-08-23 使用者定案，不做打字判分）。
#
# 為什麼在 build 時展開，而不是前端即時組合：
#   1. 每一句我都能先印出來檢查，不會在畫面上生出不合文法的句子。
#   2. 音檔要能精準補齊 —— 前端即時組合的句子不會出現在 HTML 裡，
#      export_missing_clips.py 就掃不到（時間／數字小考當年就是踩這個，才要另一條管線）。
#
# 單字或詞性有變動時重跑這支，然後跑 本機補音檔.py 補新句子的音檔。
#
# 執行：python gen_grammar_quiz.py [minna-notes.html]
#
import json, os, re, sys

HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'minna-notes.html')
HTML = os.path.normpath(HTML)
CAP = 4          # 每個有替換槽的樣板產幾句（音檔成本 = 句數 × 3 個聲音）

BAD = re.compile(r'[〜～\[\]［］\n]')


def pool_of(rows, pos):
    """該課某個詞性可用來替換的字；帶〜［］或換行的（如「[お]国」「〜時」）不收。"""
    out = []
    for r in rows:
        if r.get('pos') != pos:
            continue
        w, k, m = (r.get('word') or r.get('kana') or ''), (r.get('kana') or ''), (r.get('mean') or '')
        if not w or not k or BAD.search(w) or BAD.search(k):
            continue
        zh = m.split('、')[0].split('（')[0].split('(')[0].strip()
        if not zh:
            continue
        out.append({'w': w, 'k': k, 'zh': zh})
    return out


# 時刻不是單字表裡的字（表裡只有「〜時」這種接尾），所以內建一小組。
HOURS = [{'w': '6時', 'k': 'ろくじ', 'zh': '6點'}, {'w': '7時', 'k': 'しちじ', 'zh': '7點'},
         {'w': '8時', 'k': 'はちじ', 'zh': '8點'}, {'w': '9時', 'k': 'くじ', 'zh': '9點'},
         {'w': '10時', 'k': 'じゅうじ', 'zh': '10點'}, {'w': '12時', 'k': 'じゅうにじ', 'zh': '12點'}]
VERB_FORMS = {'': ('ます', ''), 'ta': ('ました', ''), 'nai': ('ません', ''), 'nakatta': ('ませんでした', '')}

# 動詞分兩類 —— 配錯句型會產生不合文法的題目（課本第4課⑦自己就有這個對照：
#   ✗ 10時に 勉強しました → ○ 10時から 勉強しました）。
#   瞬間動作：可以「○時に」                 持續動作：配「○時から／まで」
VERB_POINT = ['おきます', 'ねます', 'しゅっぱつします', 'おわります']
# 主語是「我」的時候不能用 終わります（結束的是事情，不是人）
VERB_POINT_SELF = ['おきます', 'ねます', 'しゅっぱつします']
ASK = ['あなた', 'あのひと']   # 問句的主語不會是自己（「我是老師嗎？」很怪）
VERB_DUR = ['はたらきます', 'べんきょうします', 'やすみます', 'のみます']

# 樣板。tokens：{job} {country} {n} {n2} {person} {place} {verb} {timeabs} {timeabs2} {timerel} {hour} {hour2}
#   jp 用漢字形、say 用假名形、zh 用詞義 —— 同一個 token 三種投影，picks 一次決定。
#   {verb.ta} 之類是動詞變化形（只影響 jp/say，中文由樣板自己寫）。
#   pick 可以指定專屬字庫（詞性不夠細時用）。
T = {
    1: [
        ('① 現在肯定句', '{person}是{job}', '{person}は {job}です', None),
        ('② 現在否定句', '{person}不是{job}', '{person}は {job}じゃ ありません', None),
        ('③ 疑問句', '{person}是{job}嗎？', '{person}は {job}ですか', {'person': ASK}),
        ('④ 疑問詞「何」', '您叫什麼名字？', 'お名前は 何ですか', None),
        ('⑤ 名詞＋の＋名詞', '是{country}的{n}', '{country}の {n}です',
         {'n': [{'w': '大学', 'k': 'だいがく', 'zh': '大學'}, {'w': '病院', 'k': 'びょういん', 'zh': '醫院'},
                {'w': '会社', 'k': 'かいしゃ', 'zh': '公司'}]}),
        ('⑥ 名詞＋も', '{person}也是{job}', '{person}も {job}です', None),
        ('⑦ 問年齡', '{person}幾歲？', '{person}は 何歳ですか', {'person': ASK}),
    ],
    2: [
        ('① これ／それ／あれ', '這是{n}', 'これは {n}です', None),
        ('① これ／それ／あれ', '那也是{n}', 'あれも {n}です', None),
        ('② この＋名詞', '這個{n}是我的', 'この {n}は わたしのです',
         {'n': ['かぎ', 'とけい', 'かさ', 'カード', 'カメラ']}),
        ('③「〜は 何ですか」', '這是什麼？', 'これは 何ですか', None),
        ('⑤ 選擇疑問', '那是{n}還是{n2}？', 'それは {n}ですか、それとも {n2}ですか', None),
        ('⑥ 誰の〜', '這是誰的{n}？', 'これは 誰の {n}ですか', None),
        ('⑥ 誰の〜', '那是我的{n}', 'それは わたしの {n}です', None),
        ('⑦ 何の〜', '這是什麼樣的{n}？', 'これは 何の {n}ですか', None),
    ],
    3: [
        ('① 場所代名詞', '這裡是{place}', 'ここは {place}です', None),
        ('② ここは何ですか', '那裡是什麼地方？', 'あそこは 何ですか', None),
        ('③ 〜は どこですか', '{place}在哪裡？', '{place}は どこですか', None),
        ('③ 〜は どこですか', '{place}在那裡', '{place}は あそこです', None),
        ('④ こちら／どちら', '您是哪國人？', 'お国は どちらですか', None),
        ('⑤ どこの＋名詞', '這是哪裡的{n}？', 'これは どこの {n}ですか',
         {'n': ['くつ', 'ネクタイ', 'ワイン', 'シャツ', 'タブレット', 'でんわ']}),
        ('⑤ どこの＋名詞', '是{country}的{n}', '{country}の {n}です',
         {'n': ['くつ', 'ネクタイ', 'ワイン', 'シャツ', 'タブレット']}),
        ('⑥ いくらですか', '這個{n}多少錢？', 'この {n}は いくらですか',
         {'n': ['くつ', 'ネクタイ', 'ワイン', 'シャツ', 'タブレット']}),
    ],
    4: [
        ('①〜は 動詞ます', '我要{verb}', 'わたしは {verb}', None),
        ('①〜は 名詞です', '{timeabs}是休假', '{timeabs}は 休みです', None),
        ('② 〜から〜まで', '從{hour}到{hour2}', '{hour}から {hour2}までです', None,
         lambda c: HOURS.index(c['hour']) < HOURS.index(c['hour2'])),
        ('② 〜から〜まで', '{hour}開始{verb}', '{hour}から {verb}', {'verb': VERB_DUR}),
        ('③ 名詞と名詞', '假日是{timeabs}和{timeabs2}', '休みは {timeabs}と {timeabs2}です', None),
        ('④ 大変', '真辛苦呀', '大変ですね', None),
        ('⑤ 句尾助詞 ね／よ', '很好吃吧', 'おいしいですね', None),
        ('⑤ 句尾助詞 ね／よ', '很好吃喔', 'おいしいですよ', None),
        ('⑥ 問星期・時間', '今天星期幾？', '今日は 何曜日ですか', None),
        ('⑥ 問星期・時間', '現在幾點？', '今 何時ですか', None),
        ('⑦ 時間＋に＋動作', '我{hour}{verb}了', 'わたしは {hour}に {verb.ta}', {'verb': VERB_POINT_SELF}),
        ('⑦ 時間＋に＋動作', '{timerel}幾點{verb}？', '{timerel} 何時に {verb}か',
         {'verb': VERB_POINT,
          'timerel': [{'w': '今日', 'k': 'きょう', 'zh': '今天'}, {'w': '明日', 'k': 'あした', 'zh': '明天'},
                      {'w': '毎日', 'k': 'まいにち', 'zh': '每天'}]}),
        ('⑧ 何時から何時まで', '{n}從幾點到幾點？', '{n}は 何時から 何時までですか',
         {'n': [{'w': '会議', 'k': 'かいぎ', 'zh': '會議'}, {'w': '試験', 'k': 'しけん', 'zh': '考試'},
                {'w': '昼休み', 'k': 'ひるやすみ', 'zh': '午休'}, {'w': '映画', 'k': 'えいが', 'zh': '電影'}]}),
        ('⑨ 動詞四種形', '{timerel}{verb}了嗎？', '{timerel} {verb.ta}か',
         {'verb': VERB_DUR,
          'timerel': [{'w': '昨日', 'k': 'きのう', 'zh': '昨天'}, {'w': '今朝', 'k': 'けさ', 'zh': '今天早上'},
                      {'w': 'おととい', 'k': 'おととい', 'zh': '前天'}]}),
        ('⑨ 動詞四種形', '不，沒有{verb}', 'いいえ、{verb.nakatta}', {'verb': VERB_DUR}),
    ],
}

TOKEN = re.compile(r'\{(\w+?)(\d?)(?:\.(\w+))?\}')


def expand(les, rows, item):
    """把一條樣板展開成最多 CAP 句。同名 token（{n}/{n2}）取不同字。"""
    label, zh_t, jp_t, picks = item[0], item[1], item[2], item[3]
    check = item[4] if len(item) > 4 else None
    names = [(m.group(1), m.group(2)) for m in TOKEN.finditer(jp_t + zh_t)]
    uniq = []
    for nm in names:
        if nm not in uniq:
            uniq.append(nm)
    pools = {}
    for base, idx in uniq:
        if picks and base in picks:
            v = picks[base]
            # picks 可以是現成的字庫，也可以是「假名清單」＝ 從該課該詞性裡挑這幾個
            pools[(base, idx)] = ([c for c in pool_of(rows, base) if c['k'] in v]
                                  if v and isinstance(v[0], str) else v)
        elif base == 'hour':
            pools[(base, idx)] = HOURS
        else:
            pools[(base, idx)] = pool_of(rows, base)
    if not uniq:
        return [{'g': label, 'zh': zh_t, 'jp': jp_t, 'say': jp_t}]
    if any(not v for v in pools.values()):
        empty = [k for k, v in pools.items() if not v]
        print('  ⚠ 略過（沒有可用的字 %s）：%s' % (empty, zh_t))
        return []
    out, seen = [], set()
    for i in range(CAP * 3):
        if len(out) >= CAP:
            break
        chosen, ok = {}, True
        used = set()
        for j, (base, idx) in enumerate(uniq):
            p = pools[(base, idx)]
            cand = None
            for step in range(len(p)):
                c = p[(i * (j + 1) + step) % len(p)]
                if c['w'] not in used:
                    cand = c
                    break
            if not cand:
                ok = False
                break
            used.add(cand['w'])
            chosen[(base, idx)] = cand
        if not ok:
            continue

        def sub(text, field):
            def f(m):
                base, idx, form = m.group(1), m.group(2), m.group(3)
                c = chosen[(base, idx)]
                if field == 'zh':
                    return c['zh']
                v = c['w'] if field == 'jp' else c['k']
                if base == 'verb':
                    suf = VERB_FORMS.get(form or '', ('ます', ''))[0]
                    v = re.sub(r'ます$', '', v) + suf
                return v
            return TOKEN.sub(f, text)

        if check and not check({b: c for (b, i2), c in chosen.items()} |
                               {b + i2: c for (b, i2), c in chosen.items()}):
            continue
        jp, say, zh = sub(jp_t, 'jp'), sub(jp_t, 'say'), sub(zh_t, 'zh')
        if jp in seen:
            continue
        seen.add(jp)
        out.append({'g': label, 'zh': zh, 'jp': jp, 'say': say})
    return out


h = open(HTML, encoding='utf-8').read()
vd = json.loads(re.search(r'<script[^>]*id="vocab-data"[^>]*>(.*?)</script>', h, re.S).group(1))

data, total = {}, 0
for les in sorted(T):
    rows = vd['lessons'].get(str(les), [])
    qs = []
    print('=== 第%d課 ===' % les)
    for item in T[les]:
        got = expand(les, rows, item)
        for q in got:
            print('   %-22s %-24s %s' % (q['g'][:22], q['zh'][:24], q['jp']))
        qs += got
    data[str(les)] = qs
    total += len(qs)
    print('   → %d 題\n' % len(qs))

print('總共 %d 題' % total)

# say 的假名版本（給 vvClip 對音檔用）。日文樣板裡的漢字要換成假名，
# 但固定句（沒有槽的）本來就是漢字，這裡補上人工對照。
FIXED_SAY = {
    'お名前は 何ですか': 'おなまえは なんですか',
    'これは 何ですか': 'これは なんですか',
    'あそこは 何ですか': 'あそこは なんですか',
    'お国は どちらですか': 'おくには どちらですか',
    '大変ですね': 'たいへんですね',
    'おいしいですね': 'おいしいですね',
    'おいしいですよ': 'おいしいですよ',
    '今日は 何曜日ですか': 'きょうは なんようびですか',
    '今 何時ですか': 'いま なんじですか',
}
REPL = [('誰の', 'だれの'), ('何の', 'なんの'), ('何歳', 'なんさい'), ('何時', 'なんじ'),
        ('わたしのです', 'わたしのです'), ('休みです', 'やすみです'), ('休みは', 'やすみは'),
        ('大変', 'たいへん'), ('今日', 'きょう'), ('今 ', 'いま '), ('私', 'わたし')]
for les, qs in data.items():
    for q in qs:
        s = FIXED_SAY.get(q['say'], q['say'])
        for a, b in REPL:
            s = s.replace(a, b)
        q['say'] = s

bad = [q for qs in data.values() for q in qs if re.search(r'[一-鿿]', q['say'])]
if bad:
    print('\n⚠ 這些題目的 say 還有漢字（音檔會對不上，要補進 FIXED_SAY／REPL）：')
    for q in bad[:20]:
        print('   ', q['say'])

blob = json.dumps(data, ensure_ascii=False)
assert '</script' not in blob
tag = '<script id="gquiz-data" type="application/json">'
if tag in h:
    h = re.sub(r'<script id="gquiz-data" type="application/json">.*?</script>', tag + blob + '</script>', h, flags=re.S)
else:
    anchor = '<script id="vv-data" type="application/json">'
    assert h.count(anchor) == 1, '找不到 vv-data 當錨點'
    h = h.replace(anchor, tag + blob + '</script>\n' + anchor)

fd = os.open(HTML, os.O_WRONLY | os.O_TRUNC)
os.write(fd, h.encode('utf-8'))
os.fsync(fd)
os.close(fd)
print('\n已寫入 <script id="gquiz-data">（%.1fKB）' % (len(blob) / 1024))
