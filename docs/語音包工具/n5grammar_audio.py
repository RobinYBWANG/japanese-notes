# n5grammar_audio.py —— 補齊 n5-grammar.html 的 VOICEVOX 音檔（本機一步跑完）
#
# 用法：python3 n5grammar_audio.py           # 引擎沒開會自動叫 本機補音檔.py --engine-only
#       python3 n5grammar_audio.py --list    # 只印出「key → 送引擎的文字」，不合成
#
# 2026-10-24 起這頁不再用瀏覽器內建語音。音檔做法跟 minna-notes 一樣：
#   - 音檔外置在 audio/n5grammar/<id>.ogg，id = md5("speaker|文本") 前 12 碼、opus 16k mono
#   - 文本 → clip 對照寫在 HTML 的 <script id="vv-data">（{"say": {文本: {speaker: id}}}）
#   - 只有一個聲音 14（跟 n5-vocab 一樣；使用者 2026-10-24 定案 N5 兩頁一種聲音就好）
# 這頁的文字不在 data-say 裡，而是 JS 的 const DATA（例句 ex[].jp、表格 table 裡含假名的格子），
# 所以 export_missing_clips.py 掃不到，另寫這支。key 的算法必須跟前端 speak() 一模一樣：
#   vvNorm(cleanSay(textContent))
# 送引擎的文字另外處理：原文的「漢字（かな）」直接換成かな（照課本標的讀音念），
# 表格裡的中文註解拿掉（「書（か）く 寫」只念 かく）；自動規則處理不好的格子寫在 OVERRIDE。
# 冪等：缺 0 個、沒有多餘的就原地結束，HTML 一個字元都不動。
import hashlib, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.normpath(os.path.join(HERE, '..', 'n5-grammar.html'))
AUDIO_DIR = os.path.normpath(os.path.join(HERE, '..', 'audio', 'n5grammar'))
BASE = 'http://127.0.0.1:50021'
VOICES = ['14']   # 只用一個聲音，跟 n5-vocab 一樣（使用者 2026-10-24 定案）
TEST_PHRASE = 'こんにちは。日本語の練習を始めましょう。'   # 語音設定的「▶ 試聽」，要跟 HTML 一致
sys.path.insert(0, HERE)
from read_fix import engine_text  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

KANA = re.compile(r'[ぁ-んァ-ヶー]')     # 前端的 kanaRe：表格格子含假名才可以點
FURI = re.compile(r'[0-9０-９]*[一-龥々]+（([ぁ-んァ-ヶー]+)）')

# 自動規則唸不好的格子（key → 送引擎的文字）。key 是前端算出來的那串（括號註解已去掉）。
OVERRIDE = {
    '何': 'なに、なん',
    '如何': 'いかが',
    '點鐘': 'よじ、しちじ、くじ',
    '分': 'ふん、ぷん',
    'る前是 a／u／o 段 → I類': 'あだん、うだん、おだん',
    'る前是 i 段 → II類': 'いだん',
    'る前是 e 段 → II類': 'えだん',
    'い段＋る': 'いだん、る',
    'え段＋る': 'えだん、る',
    '見る看・起きる起床・借りる借入・浴びる淋浴・落ちる掉落・降りる下車・できる會/能': 'みる・おきる・かりる・あびる・おちる・おりる・できる',
    '進入 → 入ります': 'はいります',
    '帰る→帰ります、入る→入ります、知る→知ります': 'かえる、かえります、はいる、はいります、しる、しります',
    'V1書か': 'かか', 'V2書き': 'かき', 'V3書く': 'かく', 'V4書け': 'かけ', 'V5書こ': 'かこ',
    '接ない → 書かない': 'かかない',
    '接ます → 書きます': 'かきます',
    '接ば → 書けば；單獨用是命令形': 'かけば',
    '接う → 書こう': 'かこう',
    'ない形': 'ないけい', 'ます形': 'ますけい', 'ば形': 'ばけい', 'て形': 'てけい', 'た形': 'たけい',
    'う段→い段＋ます：書く→書きます、飲む→飲みます、待つ→待ちます、買う→買います、話す→話します、遊ぶ→遊びます':
        'かく、かきます、のむ、のみます、まつ、まちます、かう、かいます、はなす、はなします、あそぶ、あそびます',
    '去る＋ます：食べる→食べます、見る→見ます、起きる→起きます': 'たべる、たべます、みる、みます、おきる、おきます',
    'する→します、来る→来ます': 'する、します、くる、きます',
    '明日行きます。／明日 行く。': 'あした いきます。あした いく。',
    '連接用： てください請、 ています正在、 てもいい可以、 てから之後': 'てください、ています、てもいい、てから',
    '假設： ば 如果 的話': 'ば',
    '意志/邀約： う/よう  吧': 'う、よう',
    '書か／書こ ＝ V1＋ V5': 'かか、かこ',
    '書き／書い ＝ V2＋ て形・た形的詞幹': 'かき、かい',
    '書く ＝ V3 原形': 'かく',
    '書け ＝ V4': 'かけ',
    '書け ＝ 命令「寫！」': 'かけ',
    'I類 く/ぐ': 'く、ぐ', 'I類 う/つ/る': 'う、つ、る', 'I類 ぬ/ぶ/む': 'ぬ、ぶ、む', 'I類 す': 'す',
    '→いて/いで 行く→行って 例外': 'いて、いで。いく、いって',
    '去る＋て': 'て',
    '去る＋ない': 'ない',
    'する→して、来る→来て': 'する、して、くる、きて',
    'う段→あ段＋ない う→わ：買う→買わない': 'かく、かかない、のむ、のまない。かう、かわない',
    'する→しない、来る→来ない': 'する、しない、くる、こない',
    '行った': 'いった',
}


def clean_say(t):   # 前端 cleanSay()
    t = re.sub(r'（[^）]*）', '', t)
    t = re.sub(r'\([^)]*\)', '', t)
    return re.sub(r'[～〜~※]', ' ', t).strip()


def vv_norm(t):     # 前端 vvNorm()
    return re.sub(r'[～~〜［］\[\]]', '', t).replace('　', ' ').strip()


def auto_engine(raw, table):
    t = clean_say(FURI.sub(r'\1', raw))
    if not table:
        return t
    # 表格：拿掉中文註解 —— 沒有假名的詞（寫、不寫、回去）、假名後面黏著的漢字（書く寫 → かく）
    t = t.replace('→', '、').replace('＝', '、').replace('＋', '')
    out = []
    for tok in t.split():
        parts = []
        for p in re.split(r'([・、／])', tok):
            if p in ('・', '、', '／'):
                parts.append(p)
            elif KANA.search(p):
                parts.append(re.sub(r'(?<=[ぁ-んー])[一-龥]+$', '', p))
        s = re.sub(r'[・、／]{2,}', '、', ''.join(parts)).strip('・、／')
        if s:
            out.append(s)
    return ' '.join(out)


h = open(HTML, encoding='utf-8').read()
a = h.index('const DATA = [')
b = h.index('\n];', a) + 3
DATA = json.loads(subprocess.run(['node', '-e', h[a:b] + '\nprocess.stdout.write(JSON.stringify(DATA));'],
                                 capture_output=True, text=True, check=True, encoding='utf-8').stdout)
need = {}   # key → 送引擎的文字
def add(raw, table):
    k = vv_norm(clean_say(raw))
    if k and k not in need:
        t = OVERRIDE.get(k) or auto_engine(raw, table)
        need[k] = engine_text(re.sub(r'\s*[・／→＝]\s*', '、', t))   # 分隔號換成停頓，不然一串單字會黏在一起念
for cat in DATA:
    for it in cat['items']:
        for e in it.get('ex') or []:
            add(e['jp'], False)
        for r in it.get('table') or []:
            for x in r[:2]:
                if KANA.search(x):
                    add(x, True)
add(TEST_PHRASE, False)
empty = [k for k, v in need.items() if not KANA.search(v)]
assert not empty, '這些格子算不出要念的日文，請補 OVERRIDE：%s' % empty
unused = set(OVERRIDE) - set(need)
if unused:
    print('⚠ OVERRIDE 裡有用不到的 key（文字改過了？）：', sorted(unused))
if '--list' in sys.argv:
    for k, v in need.items():
        print(k, '\t=>', v)
    sys.exit(0)

mvv = re.search(r'<script id="vv-data" type="application/json">(.*?)</script>', h, re.S)
assert mvv, '找不到 <script id="vv-data">'
VV = json.loads(mvv.group(1))
say = VV.setdefault('say', {})
aid = lambda text, sp: hashlib.md5((sp + '|' + text).encode()).hexdigest()[:12]
os.makedirs(AUDIO_DIR, exist_ok=True)
have = {f[:-4] for f in os.listdir(AUDIO_DIR) if f.endswith('.ogg')}
todo = [(k, sp) for k in need for sp in VOICES if say.get(k, {}).get(sp) not in have]
orphan = [k for k in say if k not in need]
print('文本 %d 個；缺 clip %d 個；多餘的文本 %d 個（會從對照表拿掉）' % (len(need), len(todo), len(orphan)))
if not todo and not orphan:
    print('沒有缺的，HTML 一個字元都沒動。')
    sys.exit(0)


def engine_alive():
    try:
        urllib.request.urlopen(BASE + '/version', timeout=2)
        return True
    except Exception:
        return False


if todo and not engine_alive():
    subprocess.run([sys.executable, os.path.join(HERE, '本機補音檔.py'), '--engine-only'], check=True)

TMP = tempfile.mkdtemp()


def synth(text, sp, path):
    q = urllib.parse.urlencode({'text': text, 'speaker': sp})
    query = urllib.request.urlopen(
        urllib.request.Request('%s/audio_query?%s' % (BASE, q), method='POST'), timeout=60).read()
    wav = urllib.request.urlopen(
        urllib.request.Request('%s/synthesis?speaker=%s' % (BASE, sp), data=query,
                               headers={'Content-Type': 'application/json'}, method='POST'),
        timeout=180).read()
    wavf = os.path.join(TMP, 'c.wav')
    open(wavf, 'wb').write(wav)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wavf,
                    '-c:a', 'libopus', '-b:a', '16k', '-ac', '1', path], check=True)
    if os.path.getsize(path) < 300:
        raise RuntimeError('clip too small: ' + text)


for i, (k, sp) in enumerate(todo, 1):
    cid = aid(k, sp)
    synth(need[k], sp, os.path.join(AUDIO_DIR, cid + '.ogg'))
    say.setdefault(k, {})[sp] = cid
    if i % 30 == 0 or i == len(todo):
        print('  ...%d/%d' % (i, len(todo)))
for k in orphan:
    del say[k]

out = h[:mvv.start(1)] + json.dumps(VV, ensure_ascii=False) + h[mvv.end(1):]
fd = os.open(HTML, os.O_WRONLY | os.O_TRUNC)
os.write(fd, out.encode('utf-8'))
os.fsync(fd)
os.close(fd)
h2 = open(HTML, encoding='utf-8').read()
assert h2.rstrip().endswith('</html>'), '檔案結尾不對'
VV2 = json.loads(re.search(r'<script id="vv-data" type="application/json">(.*?)</script>', h2, re.S).group(1))
still = [(k, sp) for k in need for sp in VOICES
         if not os.path.exists(os.path.join(AUDIO_DIR, VV2['say'].get(k, {}).get(sp, '-') + '.ogg'))]
assert not still, '合併後仍缺 %d 個' % len(still)
print('完成：新增 %d 個 clip；對照表 %d 個文本' % (len(todo), len(VV2['say'])))
print('驗證：node test_grammar.mjs')
