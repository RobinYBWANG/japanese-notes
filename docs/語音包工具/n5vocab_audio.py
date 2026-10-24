# n5vocab_audio.py —— 補齊 n5-vocab.html 的 VOICEVOX 音檔（本機一步跑完）
#
# 用法：python3 n5vocab_audio.py            # 引擎沒開會自動叫 本機補音檔.py --engine-only
#       python3 n5vocab_audio.py --prune    # 另外把用不到的 clip（含舊的單一聲音 14）從對照表和資料夾刪掉
#
# 這頁的文字在 JS 的 DATA.push(...)（不是 vocab-data），export_missing_clips.py 吃不到，另寫這支。
# 只有一個聲音 14（使用者 2026-10-24 定案：N5 總單字、N5 總文法一種聲音就好）。
#   - 音檔外置在 audio/n5vocab/<id>.ogg，id = md5("speaker|文本") 前 12 碼、opus 16k mono
#   - 對照表在 <script id="vv-data">（{"say": {文本: {speaker: id}}}）
# 要念的文字跟前端 build() 一樣：單字格 r[1]||r[0]、假名格 r[1]、例句 r[4]；key 用 vvNorm()。
# 冪等：缺 0 個、沒有要刪的就原地結束，HTML 一個字元都不動。
import hashlib, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.normpath(os.path.join(HERE, '..', 'n5-vocab.html'))
AUDIO_DIR = os.path.normpath(os.path.join(HERE, '..', 'audio', 'n5vocab'))
BASE = 'http://127.0.0.1:50021'
VOICES = ['14']
PRUNE = '--prune' in sys.argv
sys.path.insert(0, HERE)
from read_fix import engine_text  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def vv_norm(t):     # 前端 vvNorm()
    return re.sub(r'[～~〜［］\[\]]', '', str(t or '')).replace('　', ' ').strip()


h = open(HTML, encoding='utf-8').read()
a = h.index('const DATA=[];')
b = h.index('/*==END DATA==*/', a)
DATA = json.loads(subprocess.run(['node', '-e', h[a:b] + '\nprocess.stdout.write(JSON.stringify(DATA));'],
                                 capture_output=True, text=True, check=True, encoding='utf-8').stdout)
need = []
for blk in DATA:
    for r in blk['items']:
        for t in (r[1] or r[0], r[1], r[4] if len(r) > 4 else ''):
            k = vv_norm(t)
            if k:
                need.append(k)
need = list(dict.fromkeys(need))
need_set = set(need)

mvv = re.search(r'<script id="vv-data" type="application/json">(.*?)</script>', h, re.S)
assert mvv, '找不到 <script id="vv-data">'
VV = json.loads(mvv.group(1))
say = VV.setdefault('say', {})
aid = lambda text, sp: hashlib.md5((sp + '|' + text).encode()).hexdigest()[:12]
have = {f[:-4] for f in os.listdir(AUDIO_DIR) if f.endswith('.ogg')}
todo = [(k, sp) for k in need for sp in VOICES if say.get(k, {}).get(sp) not in have]
# 要刪的：整句用不到的文本，以及用得到的文本裡不是 14 的聲音
drop = [(k, sp) for k, d in say.items() for sp in d if k not in need_set or sp not in VOICES]
print('文本 %d 個；缺 clip %d 個；用不到的 clip %d 個%s' % (
    len(need), len(todo), len(drop), '（--prune 刪掉）' if PRUNE else '（不動，要刪加 --prune）'))
if not todo and not (PRUNE and drop):
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


def save():
    out = h[:mvv.start(1)] + json.dumps(VV, ensure_ascii=False) + h[mvv.end(1):]
    fd = os.open(HTML, os.O_WRONLY | os.O_TRUNC)
    os.write(fd, out.encode('utf-8'))
    os.fsync(fd)
    os.close(fd)


for i, (k, sp) in enumerate(todo, 1):
    cid = aid(k, sp)
    synth(engine_text(k), sp, os.path.join(AUDIO_DIR, cid + '.ogg'))
    say.setdefault(k, {})[sp] = cid
    if i % 100 == 0 or i == len(todo):
        print('  ...%d/%d' % (i, len(todo)))
        save()             # 中途存檔：跑到一半中斷，下次從缺的地方接著跑

if PRUNE:
    keep = {cid for k, d in say.items() for sp, cid in d.items() if k in need_set and sp in VOICES}
    for k, sp in drop:
        cid = say[k].pop(sp)
        if cid not in keep and os.path.exists(os.path.join(AUDIO_DIR, cid + '.ogg')):
            os.remove(os.path.join(AUDIO_DIR, cid + '.ogg'))
    for k in [k for k, d in say.items() if not d]:
        del say[k]
save()

h2 = open(HTML, encoding='utf-8').read()
assert h2.rstrip().endswith('</html>'), '檔案結尾不對'
VV2 = json.loads(re.search(r'<script id="vv-data" type="application/json">(.*?)</script>', h2, re.S).group(1))
still = [(k, sp) for k in need for sp in VOICES
         if not os.path.exists(os.path.join(AUDIO_DIR, VV2['say'].get(k, {}).get(sp, '-') + '.ogg'))]
assert not still, '合併後仍缺 %d 個' % len(still)
print('完成：新增 %d 個 clip；對照表 %d 個文本' % (len(todo), len(VV2['say'])))
print('驗證：node test_n5vocab.mjs')
